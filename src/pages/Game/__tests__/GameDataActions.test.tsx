import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addToastSpy, toastModuleMock } from '@/test/toastMock';
import { firestoreMockModule, firestoreStore } from '@/test/firestoreMock';
import { GameSyncContext } from '@/components/app/SaveStatus/GameSyncContext';
import { changeQueue, emptyQueue } from '@/lib/syncStorage';
import type { GameSync } from '@/lib/gameSync';

vi.mock('@/components/app', () => toastModuleMock());
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => firestoreMockModule());

import { GameDataActions } from '../GameDataActions';

const GAME_PATH = 'games/long-winter';

const gameDoc = () => ({
  name: 'The Long Winter',
  createdAt: 1_700_000_000_000,
  characters: [{ id: 'c1', name: 'Brgenwose', playbook: 'heavy', level: 1, data: {} }],
});

const envelopeJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'hearthfire-game-export',
    version: 1,
    exportedAt: '2026-08-17T14:30:00.000Z',
    gameId: 'long-winter',
    gameName: 'The Long Winter',
    game: gameDoc(),
    ...overrides,
  });

const backupFile = (contents: string, name = 'backup.json') =>
  new File([contents], name, { type: 'application/json' });

// The input is aria-hidden and driven programmatically by the visible button, so it has
// no accessible name to query by.
const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]')!;

let downloads: string[];
let click: ReturnType<typeof vi.spyOn>;
let testStore: GameSync | null = null;

const renderActions = (onReplaceGameData = vi.fn().mockResolvedValue(undefined)) => {
  const view = render(
    <GameSyncContext.Provider value={testStore}>
      <GameDataActions gameId="long-winter" gameName="The Long Winter" onReplaceGameData={onReplaceGameData} />
    </GameSyncContext.Provider>,
  );
  return { ...view, onReplaceGameData };
};

beforeEach(async () => {
  testStore = null;
  await changeQueue('long-winter', () => emptyQueue('long-winter'));
  firestoreStore.reset();
  firestoreStore.set(GAME_PATH, gameDoc());
  addToastSpy.mockClear();

  // jsdom implements neither, and the anchor click would try to navigate. Record every
  // download so the tests can assert the safety copy happened and in what order.
  downloads = [];
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  click.mockRestore();
});

describe('GameDataActions — export', () => {
  it('downloads the game and names the file in a toast', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /export game data/i }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^hearthfire-the-long-winter-\d{4}-\d{2}-\d{2}\.json$/);
    expect(addToastSpy).toHaveBeenCalledWith(expect.stringContaining('Downloaded hearthfire-'), 'success');
  });

  it('tells the GM when the game could not be read instead of failing silently', async () => {
    firestoreStore.delete(GAME_PATH);
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /export game data/i }));

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith(expect.stringContaining("Couldn't export this game"), 'error'),
    );
    expect(downloads).toHaveLength(0);
  });
});

describe('GameDataActions — choosing a file', () => {
  it('rejects a file that is not a Hearthfire backup without opening the dialog', async () => {
    const { container, onReplaceGameData } = renderActions();
    await userEvent.upload(fileInput(container), backupFile('{"hello":"world"}'));

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith(
        expect.stringContaining("doesn't look like a Hearthfire game backup"),
        'error',
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onReplaceGameData).not.toHaveBeenCalled();
  });

  it('rejects a damaged file without opening the dialog', async () => {
    const { container } = renderActions();
    await userEvent.upload(fileInput(container), backupFile('{ not json'));

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith(expect.stringContaining("isn't valid JSON"), 'error'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the confirm dialog for a valid backup but writes nothing yet', async () => {
    const { container, onReplaceGameData } = renderActions();
    await userEvent.upload(fileInput(container), backupFile(envelopeJson()));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/everything in this game will be overwritten/i)).toBeInTheDocument();
    expect(onReplaceGameData).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });

  it('leaves the game untouched when the GM cancels', async () => {
    const { container, onReplaceGameData } = renderActions();
    await userEvent.upload(fileInput(container), backupFile(envelopeJson()));
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onReplaceGameData).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });
});

describe('GameDataActions — backup completeness', () => {
  const makeStore = (unpersisted = 0): GameSync => ({
    getSnapshot: () => ({ localWrites: 0 }),
    getRecovery: () => ({
      pending: [], sending: undefined, conflict: undefined,
      unpersisted: Array.from({ length: unpersisted }, (_, i) => ({ id: String(i) })),
    }),
  }) as unknown as GameSync;

  it('blocks export when durable drafts are queued in another tab', async () => {
    testStore = makeStore();
    await changeQueue('long-winter', (queue) => ({
      ...queue,
      pending: [{ id: 'draft', writer: 'elsewhere', generation: 'old', label: 'draft', changes: [], createdAt: 0 }],
    }));
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /export game data/i }));
    await waitFor(() => expect(addToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sync or resolve your local changes'),
      'error',
    ));
    expect(downloads).toHaveLength(0);
  });

  it('blocks export while this tab has a draft not yet saved to IndexedDB', async () => {
    testStore = makeStore(1);
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /export game data/i }));
    await waitFor(() => expect(addToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sync or resolve your local changes'),
      'error',
    ));
    expect(downloads).toHaveLength(0);
  });

  it('refuses backup restore when unsynced drafts would be omitted from its safety copy', async () => {
    testStore = makeStore(1);
    const onReplace = vi.fn().mockResolvedValue(undefined);
    const { container } = renderActions(onReplace);
    await userEvent.upload(fileInput(container), backupFile(envelopeJson()));
    await userEvent.click(await screen.findByRole('button', { name: /replace game data/i }));
    await waitFor(() => expect(addToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('before importing'),
      'error',
    ));
    expect(onReplace).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });
});

describe('GameDataActions — confirming the import', () => {
  const confirmImport = async (container: HTMLElement, contents = envelopeJson()) => {
    await userEvent.upload(fileInput(container), backupFile(contents));
    await userEvent.click(await screen.findByRole('button', { name: /replace game data/i }));
  };

  it('downloads a safety copy BEFORE overwriting, so the GM always has an undo file', async () => {
    const order: string[] = [];
    const onReplaceGameData = vi.fn(async () => { order.push('overwrite'); });
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
      order.push('safety-copy');
    });

    const { container } = renderActions(onReplaceGameData);
    await confirmImport(container);

    await waitFor(() => expect(onReplaceGameData).toHaveBeenCalled());
    expect(order).toEqual(['safety-copy', 'overwrite']);
    expect(downloads[0]).toMatch(/before-import/);
  });

  it('hands the imported data through untouched', async () => {
    const { container, onReplaceGameData } = renderActions();
    await confirmImport(container);

    await waitFor(() => expect(onReplaceGameData).toHaveBeenCalledWith(gameDoc()));
  });

  it('closes the dialog and confirms the restore', async () => {
    const { container } = renderActions();
    await confirmImport(container);

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith('Game data restored from backup.', 'success'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ABORTS the overwrite when the safety copy fails — nothing is lost', async () => {
    const { container, onReplaceGameData } = renderActions();
    // The game vanishing between opening the dialog and confirming makes the
    // pre-import snapshot impossible.
    await userEvent.upload(fileInput(container), backupFile(envelopeJson()));
    await screen.findByRole('dialog');
    firestoreStore.delete(GAME_PATH);
    await userEvent.click(screen.getByRole('button', { name: /replace game data/i }));

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith(
        expect.stringContaining('the import was cancelled. Nothing has changed.'),
        'error',
      ),
    );
    expect(onReplaceGameData).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('explains why an import is blocked by unsynced changes', async () => {
    const onReplaceGameData = vi.fn().mockRejectedValue(new Error('Resolve and sync pending changes before restoring.'));
    const { container } = renderActions(onReplaceGameData);
    await confirmImport(container);

    await waitFor(() => expect(addToastSpy).toHaveBeenCalledWith(
      'Sync or resolve pending changes before restoring a backup.',
      'error',
    ));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(downloads).toHaveLength(1);
  });

  it('reports unexpected restore failures instead of silently returning', async () => {
    const onReplaceGameData = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
    const { container } = renderActions(onReplaceGameData);
    await confirmImport(container);

    await waitFor(() => expect(addToastSpy).toHaveBeenCalledWith(
      "Couldn't restore this game. Check save status and try again.",
      'error',
    ));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the dialog open and claims no success when the overwrite fails', async () => {
    const onReplaceGameData = vi.fn().mockRejectedValue(new Error('permission-denied'));
    const { container } = renderActions(onReplaceGameData);
    await confirmImport(container);

    await waitFor(() => expect(onReplaceGameData).toHaveBeenCalled());
    expect(addToastSpy).not.toHaveBeenCalledWith('Game data restored from backup.', 'success');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The safety copy still landed, so the GM can recover by hand.
    expect(downloads[0]).toMatch(/before-import/);
  });

  it('lets the GM retry after a failed overwrite', async () => {
    const onReplaceGameData = vi.fn()
      .mockRejectedValueOnce(new Error('permission-denied'))
      .mockResolvedValueOnce(undefined);
    const { container } = renderActions(onReplaceGameData);
    await confirmImport(container);

    const retry = await screen.findByRole('button', { name: /replace game data/i });
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);

    await waitFor(() =>
      expect(addToastSpy).toHaveBeenCalledWith('Game data restored from backup.', 'success'),
    );
    expect(onReplaceGameData).toHaveBeenCalledTimes(2);
  });
});
