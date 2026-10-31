import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GameSession } from '@/types';
import { RelationshipGraph } from '../RelationshipGraph';

const game: GameSession = {
  id: 'g1', name: 'Stonetop', createdAt: 0, characters: [],
  steading: { residents: [
    {
      id: 'guard', name: 'Ffion', occupation: 'Soldier', traits: ['fearless'],
      relationships: [{ id: 'r1', targetKind: 'resident', targetId: 'healer', type: 'friend' }],
    },
    { id: 'healer', name: 'Eira', occupation: 'Healer' },
  ] },
};

describe('relationship map hovers', () => {
  it('shows NPC metadata and the relationship list on hover, then hides it', () => {
    render(<RelationshipGraph game={game} />);
    const node = screen.getByRole('group', { name: /Ffion, show relationship details/ });
    fireEvent.mouseEnter(node, { clientX: 90, clientY: 80 });
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Ffion');
    expect(card).toHaveTextContent('Soldier');
    expect(card).toHaveTextContent('fearless');
    expect(card).toHaveTextContent('Ffion → Eira: friend');
    fireEvent.mouseLeave(node);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('also shows details on keyboard focus', () => {
    render(<RelationshipGraph game={game} />);
    const node = screen.getByRole('group', { name: /Eira, show relationship details/ });
    fireEvent.focus(node);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ffion → Eira: friend');
    fireEvent.blur(node);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows direction and label when hovering a relationship edge', () => {
    const { container } = render(<RelationshipGraph game={game} />);
    const edgeLabel = Array.from(container.querySelectorAll('svg text'))
      .find((node) => node.textContent === 'friend');
    expect(edgeLabel).toBeDefined();
    fireEvent.mouseEnter(edgeLabel!.parentElement!, { clientX: 120, clientY: 100 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ffion → Eira: friend');
  });
});
