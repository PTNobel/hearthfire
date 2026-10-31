import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PageLayout } from '../PageLayout';

const diceRoller = { rollerId: 'gm', rollerName: 'GM', onRoll: vi.fn().mockResolvedValue(undefined) };

afterEach(() => vi.unstubAllEnvs());

describe('PageLayout dice roller', () => {
  it('mounts the roller when the page passes diceRoller', () => {
    renderWithProviders(<PageLayout title="Test" gameId="g1" diceRoller={diceRoller}>body</PageLayout>);
    expect(screen.getByRole('button', { name: 'Dice' })).toBeInTheDocument();
  });

  it('leaves it out otherwise', () => {
    renderWithProviders(<PageLayout title="Test" gameId="g1">body</PageLayout>);
    expect(screen.queryByRole('button', { name: 'Dice' })).not.toBeInTheDocument();
  });

  it('never shows it in simple mode', () => {
    renderWithProviders(<PageLayout simple>body</PageLayout>);
    expect(screen.queryByRole('button', { name: 'Dice' })).not.toBeInTheDocument();
  });
});

describe('PageLayout shared map', () => {
  it('opens the configured Miro board in a separate tab', () => {
    vi.stubEnv('VITE_MIRO_BOARD_URL', 'https://miro.com/app/board/uXjMapExample/?share_link_id=123');
    renderWithProviders(<PageLayout title="Test" gameId="g1">body</PageLayout>);

    expect(screen.getByRole('link', { name: 'Open shared map in Miro (new tab)' }))
      .toHaveAttribute('href', 'https://miro.com/app/board/uXjMapExample/?share_link_id=123');
    expect(screen.getByRole('link', { name: 'Open shared map in Miro (new tab)' }))
      .toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Open shared map in Miro (new tab)' }))
      .toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides the map link when the board is not configured', () => {
    vi.stubEnv('VITE_MIRO_BOARD_URL', '');
    renderWithProviders(<PageLayout title="Test" gameId="g1">body</PageLayout>);
    expect(screen.queryByRole('link', { name: /shared map in Miro/i })).not.toBeInTheDocument();
  });

  it('never shows the map link on the session entry page', () => {
    vi.stubEnv('VITE_MIRO_BOARD_URL', 'https://miro.com/app/board/uXjMapExample/');
    renderWithProviders(<PageLayout simple>body</PageLayout>);
    expect(screen.queryByRole('link', { name: /shared map in Miro/i })).not.toBeInTheDocument();
  });
});
