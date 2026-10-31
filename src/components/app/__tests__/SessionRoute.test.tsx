import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionRoute } from '../SessionRoute';
import { saveSessionGameId, clearSessionGameId } from '@/lib/sessionGame';

const renderSessionRoute = () => render(
  <MemoryRouter initialEntries={['/game/gm']}>
    <Routes>
      <Route path="/" element={<div>Session sign-in</div>} />
      <Route element={<SessionRoute />}>
        <Route path="/game/gm" element={<div>GM Playbook</div>} />
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

  it('renders the playbook for a stored session with no URL credential', () => {
    saveSessionGameId('four-random-fantasy-words');
    renderSessionRoute();
    expect(screen.getByText('GM Playbook')).toBeInTheDocument();
  });
});
