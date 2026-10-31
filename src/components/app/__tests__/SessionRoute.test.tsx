import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firestoreMockModule } from '@/test/firestoreMock';
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => firestoreMockModule());
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionRoute } from '../SessionRoute';
import { saveSessionGameId, clearSessionGameId, requireSessionGameId } from '@/lib/sessionGame';

const renderSessionRoute = (sheet: React.ReactElement = <div>GM Playbook</div>) => render(
  <MemoryRouter initialEntries={['/game/gm']}>
    <Routes>
      <Route path="/" element={<div>Session sign-in</div>} />
      <Route element={<SessionRoute />}>
        <Route path="/game/gm" element={sheet} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

describe('SessionRoute', () => {
  beforeEach(() => clearSessionGameId());

  it('redirects to sign-in when no session is present', () => {
    renderSessionRoute();
    expect(screen.getByText('Session sign-in')).toBeInTheDocument();
    expect(screen.queryByText('GM Playbook')).not.toBeInTheDocument();
  });

  it('renders the playbook for a stored session with no URL credential', async () => {
    saveSessionGameId('four-random-fantasy-words');
    renderSessionRoute();
    expect(await screen.findByText('GM Playbook')).toBeInTheDocument();
  });

  it('leaves the sheet when the remembered game is forgotten in another tab', () => {
    saveSessionGameId('remembered-game');
    renderSessionRoute();
    act(() => {
      localStorage.setItem('hearthfire:session-game-id', '');
      window.dispatchEvent(new StorageEvent('storage', { key: 'hearthfire:session-game-id', storageArea: localStorage }));
    });
    expect(screen.getByText('Session sign-in')).toBeInTheDocument();
    expect(screen.queryByText('GM Playbook')).not.toBeInTheDocument();
  });

  it('remounts the sheet when another tab remembers a different game', async () => {
    const Sheet = () => {
      const [initialGame] = useState(requireSessionGameId);
      return <div>{initialGame}</div>;
    };
    saveSessionGameId('first-game');
    renderSessionRoute(<Sheet />);
    expect(await screen.findByText('first-game')).toBeInTheDocument();
    act(() => {
      localStorage.setItem('hearthfire:session-game-id', 'second-game');
      window.dispatchEvent(new StorageEvent('storage', { key: 'hearthfire:session-game-id', storageArea: localStorage }));
    });
    expect(await screen.findByText('second-game')).toBeInTheDocument();
    expect(screen.queryByText('first-game')).not.toBeInTheDocument();
  });
});
