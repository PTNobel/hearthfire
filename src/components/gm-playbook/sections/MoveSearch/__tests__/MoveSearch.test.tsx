import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoveSearch } from '../MoveSearch';

describe('GM move search', () => {
  it('finds moves by words in their description, not just the name', async () => {
    const user = userEvent.setup();
    render(<MoveSearch />);
    await user.type(screen.getByRole('textbox', { name: 'Search moves by name or text' }), 'SQUAMOUS');

    const results = screen.getByRole('region', { name: 'Move search results' });
    expect(within(results).getByText('Child of the Deeps')).toBeInTheDocument();
  });

  it('searches list items and preserves title searches', async () => {
    const user = userEvent.setup();
    render(<MoveSearch />);
    const input = screen.getByRole('textbox', { name: 'Search moves by name or text' });

    await user.type(input, 'overcome their fear');
    expect(screen.getByText('Strengthen Your Bond')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'RAVENOUS');
    expect(screen.getByText('Ravenous')).toBeInTheDocument();
  });

  it('keeps empty and unmatched results out of the way', async () => {
    const user = userEvent.setup();
    render(<MoveSearch />);
    expect(screen.queryByRole('region', { name: 'Move search results' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Search moves by name or text' }), 'not-a-move-anywhere');
    expect(screen.getByText(/No moves match/)).toBeInTheDocument();
  });
});
