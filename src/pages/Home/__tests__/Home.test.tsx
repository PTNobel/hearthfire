import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createGameWithId, gameIdExists } from '@/lib/game';
import { Home } from '../Home';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/lib/game', () => ({
  createGameWithId: vi.fn(),
  gameIdExists: vi.fn(),
}));

const mockGameIdExists = vi.mocked(gameIdExists);
const mockCreateGame = vi.mocked(createGameWithId);

describe('Home', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGameIdExists.mockReset();
    mockCreateGame.mockReset();
  });

  it('opens an existing game when the session ID is valid', async () => {
    mockGameIdExists.mockResolvedValue(true);
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'abcdef0123456789');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(mockGameIdExists).toHaveBeenCalledWith('abcdef0123456789');
    expect(mockNavigate).toHaveBeenCalledWith('/game/abcdef0123456789');
    expect(mockCreateGame).not.toHaveBeenCalled();
  });

  it('creates the authorized game the first time it is opened', async () => {
    mockGameIdExists.mockResolvedValue(false);
    mockCreateGame.mockResolvedValue();
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'abcdef0123456789');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(mockCreateGame).toHaveBeenCalledWith('abcdef0123456789');
    expect(mockNavigate).toHaveBeenCalledWith('/game/abcdef0123456789', { state: { isNew: true } });
  });

  it('displays an error when Firestore rejects an invalid ID', async () => {
    mockGameIdExists.mockRejectedValue(new Error('permission-denied'));
    renderWithProviders(<Home />);
    await userEvent.type(screen.getByLabelText(/session id/i), 'wrong-session-id');
    await userEvent.click(screen.getByRole('button', { name: /open game/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid session id/i);
    expect(mockCreateGame).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
