import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRoute } from '@/test/renderWithProviders';
import { CharacterPlaybook } from '@/pages/CharacterPlaybook/CharacterPlaybook';
import { saveSessionGameId, clearSessionGameId } from '@/lib/sessionGame';
import type { GameSession } from '@/types';

const mockGame: GameSession = {
  id: 'game-1',
  name: 'The Long Road',
  createdAt: 0,
  characters: [
    { id: 'char-1', name: 'Sable', playbook: 'blessed', level: 1 },
  ],
};

vi.mock('@/hooks/useGame', () => ({
  useGame: () => ({
    game: mockGame,
    loading: false,
    error: null,
    updateCharacterName: vi.fn(),
    updateCharacterData: vi.fn(),
    adjustCharacterStats: vi.fn(),
    updateGameName: vi.fn(),
    updateContent: vi.fn(),
    updateField: vi.fn(),
    updateSteading: vi.fn(),
    addCharacter: vi.fn(),
    removeCharacter: vi.fn(),
  }),
}));

describe('CharacterSheet — playbook-specific sections', () => {
  beforeEach(() => saveSessionGameId('game-1'));
  afterEach(() => clearSessionGameId());
  it('renders Blessed-specific "Sacred Pouch" section for a blessed character', async () => {
    renderRoute(<CharacterPlaybook />, '/game/blessed', '/game/:playbook');
    // Playbook sections are lazy-loaded, so the section resolves asynchronously. Cold CI runners can
    // take longer than findByText's 1s default to resolve the dynamic import, so give it headroom.
    expect(
      await screen.findByText('Sacred Pouch', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
