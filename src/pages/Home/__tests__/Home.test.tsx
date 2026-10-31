import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createGameWithId, gameIdExists } from '@/lib/game';
import { Home } from '../Home';
import { getSessionGameId, saveSessionGameId, clearSessionGameId } from '@/lib/sessionGame';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/lib/game', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/game')>();
  return { ...actual, createGameWithId: vi.fn(), gameIdExists: vi.fn() };
});

const mockGameIdExists = vi.mocked(gameIdExists);
const mockCreateGame = vi.mocked(createGameWithId);

describe('Home', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    clearSessionGameId();
    mockGameIdExists.mockReset();
    mockCreateGame.mockReset();
  });

  it('opens an existing game when the session ID is valid', async () => {
    mockGameIdExists.mockResolvedValue(true);
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'abcdef0123456789');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(mockGameIdExists).toHaveBeenCalledWith('abcdef0123456789');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game', undefined));
    expect(getSessionGameId()).toBe('abcdef0123456789');
    expect(mockCreateGame).not.toHaveBeenCalled();
  });

  it('creates the authorized game the first time it is opened', async () => {
    mockGameIdExists.mockResolvedValue(false);
    mockCreateGame.mockResolvedValue(undefined);
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'abcdef0123456789');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(mockCreateGame).toHaveBeenCalledWith('abcdef0123456789');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game', { state: { isNew: true } }));
    expect(getSessionGameId()).toBe('abcdef0123456789');
  });

  it('displays an error when Firestore rejects an invalid ID', async () => {
    mockGameIdExists.mockRejectedValue(new Error('permission-denied'));
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'wrong-session-id');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid session id/i);
    expect(getSessionGameId()).toBeNull();
    expect(mockCreateGame).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('continues a remembered game without asking for or exposing its ID', async () => {
    saveSessionGameId('private-remembered-game');
    const { container } = renderWithProviders(<Home />);
    expect(screen.queryByLabelText(/session id/i)).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('private-remembered-game');
    await userEvent.click(screen.getByRole('button', { name: 'Continue game' }));
    expect(mockNavigate).toHaveBeenCalledWith('/game');
    expect(mockGameIdExists).not.toHaveBeenCalled();
    expect(mockCreateGame).not.toHaveBeenCalled();
  });

  it('forgets remembered access and returns to an empty sign-in form', async () => {
    saveSessionGameId('private-remembered-game');
    renderWithProviders(<Home />);
    await userEvent.click(screen.getByRole('button', { name: 'Forget this device' }));
    expect(getSessionGameId()).toBeNull();
    expect(screen.getByLabelText(/session id/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Continue game' })).not.toBeInTheDocument();
  });

  it('updates when another tab remembers or forgets a game', () => {
    renderWithProviders(<Home />);
    const update = (value: string) => act(() => {
      localStorage.setItem('hearthfire:session-game-id', value);
      window.dispatchEvent(new StorageEvent('storage', { key: 'hearthfire:session-game-id', storageArea: localStorage }));
    });
    update('remembered-elsewhere');
    expect(screen.getByRole('button', { name: 'Continue game' })).toBeInTheDocument();
    update('');
    expect(screen.getByLabelText(/session id/i)).toBeInTheDocument();
  });
});
