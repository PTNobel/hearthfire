import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RollAffordance } from '../RollAffordance';
import type { RollBand } from '@/types';

const BANDS: RollBand[] = [
  { label: '10+', min: 10, max: null },
  { label: '7-9', min: 7, max: 9 },
];

// Force a fixed sequence of d6 values (Math.random returns [0,1); (v*6|0)+1 gives the face).
const seedDice = (faces: number[]) => {
  const values = faces.map((f) => (f - 1) / 6 + 0.001);
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[i++ % values.length]);
};

afterEach(() => vi.restoreAllMocks());

describe('RollAffordance advantage / disadvantage', () => {
  // The toggle used to live inside the result panel, so it only existed once a roll had been made — but
  // players normally know they have advantage before they touch the dice.
  it('offers the mode toggle before anything has been rolled', () => {
    render(<RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} />);
    expect(screen.getByRole('group', { name: 'Advantage / disadvantage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adv' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('rolls three dice when advantage is armed first', async () => {
    seedDice([2, 5, 6]);
    const user = userEvent.setup();
    render(<RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} />);

    await user.click(screen.getByRole('button', { name: 'Adv' }));
    await user.click(screen.getByLabelText('Roll +WIS'));

    expect(screen.getByText('= 11')).toBeInTheDocument(); // 5 + 6, dropping the 2
  });

  it('shows the dice and numeric total without a second outcome-band label', async () => {
    seedDice([3, 4]);
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(<RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} onRoll={onRoll} />);

    await user.click(screen.getByLabelText('Roll +WIS'));
    expect(screen.getByText('= 7')).toBeInTheDocument();
    // Keep the outcome classification for the shared roll log, not the inline UI.
    expect(onRoll).toHaveBeenCalledWith(expect.objectContaining({ total: 7, band: '7-9' }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByText('7-9')).not.toBeInTheDocument();
  });

  it('pre-selects disadvantage when the stat carries a marked debility', () => {
    render(<RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage />);
    expect(screen.getByRole('button', { name: 'Dis' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The heart of the issue: choosing advantage after the dice land must keep those dice.
  it('adds a die to the roll on the table instead of re-rolling it', async () => {
    seedDice([2, 5, 6]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={1} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    expect(onRoll.mock.calls[0][0]).toMatchObject({ dice: [2, 5], total: 8, mode: 'normal' });

    await user.click(screen.getByRole('button', { name: 'Adv' }));
    // The 2 and 5 are still there; only the 6 is new, and the lowest is dropped.
    expect(onRoll.mock.calls[1][0]).toMatchObject({ dice: [2, 5, 6], total: 12, mode: 'adv' });
  });

  // A mode change alters the existing roll, so the shared log must edit that entry rather than gain a
  // second one — the id is what logRoll's id-merge keys on.
  it('reports a mode change under the same roll id', async () => {
    seedDice([2, 5, 6]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    await user.click(screen.getByRole('button', { name: 'Dis' }));
    expect(onRoll.mock.calls[1][0].rollId).toBe(onRoll.mock.calls[0][0].rollId);

    // A fresh roll is a different roll and gets its own id.
    await user.click(screen.getByLabelText('Re-roll'));
    expect(onRoll.mock.calls[2][0].rollId).not.toBe(onRoll.mock.calls[0][0].rollId);
  });

  it('gives back the original two dice when switched back to normal', async () => {
    seedDice([2, 5, 6]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    await user.click(screen.getByRole('button', { name: 'Adv' }));
    await user.click(screen.getByLabelText('Normal — 2 dice'));

    expect(onRoll.mock.calls[2][0]).toMatchObject({ dice: [2, 5], total: 7, mode: 'normal' });
  });

  // Toggling away and back must not re-roll the third die — that would be a free re-roll of it.
  it('reuses the set-aside third die when advantage is re-applied', async () => {
    // Only [2, 5, 6] are seeded before the sequence repeats, so a re-rolled third die would come up 2.
    seedDice([2, 5, 6]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    await user.click(screen.getByRole('button', { name: 'Adv' }));
    await user.click(screen.getByLabelText('Normal — 2 dice'));
    await user.click(screen.getByRole('button', { name: 'Adv' }));

    expect(onRoll.mock.calls[3][0]).toMatchObject({ dice: [2, 5, 6], total: 11 });
  });

  // The mode carries the modifier the roll was made with, not whatever the stepper reads now.
  it('keeps the rolled modifier when the mode changes', async () => {
    seedDice([2, 5, 6]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={2} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    await user.click(screen.getByLabelText('Add 1 to the roll'));
    await user.click(screen.getByRole('button', { name: 'Adv' }));

    expect(onRoll.mock.calls[1][0]).toMatchObject({ mod: 2, total: 13 });
  });

  it('does nothing when the already-selected mode is clicked again', async () => {
    seedDice([2, 5]);
    const onRoll = vi.fn();
    const user = userEvent.setup();
    render(
      <RollAffordance stat="WIS" bands={BANDS} mod={0} debilityDisadvantage={false} onRoll={onRoll} />,
    );

    await user.click(screen.getByLabelText('Roll +WIS'));
    await user.click(screen.getByLabelText('Normal — 2 dice'));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });
});
