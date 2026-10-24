import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ANIMAL_TYPES, TypePicksSection } from '../AnimalType';

const config = ANIMAL_TYPES[0];

const renderSection = (bonusPicks: number, picked: string[]) =>
  render(
    <TypePicksSection
      typeId={config.id}
      typeConfig={config}
      bonusPicks={bonusPicks}
      isSelected
      picks={Object.fromEntries(picked.map((id) => [`${config.id}:${id}`, true]))}
      customText=""
      customChecked={false}
      onPickChange={vi.fn()}
      onCustomChange={vi.fn()}
      onCustomBlur={vi.fn()}
      onCustomCheckedChange={vi.fn()}
    />,
  );

// Picks that are neither default-checked nor already chosen.
const openIds = (taken: number) =>
  config.picks.filter((p) => !p.defaultChecked).slice(0, taken).map((p) => p.id);

describe('TypePicksSection pick limit', () => {
  it('locks the remaining boxes once the base picks are used', () => {
    renderSection(0, openIds(config.pickCount));
    expect(screen.getByText(`Pick ${config.pickCount} more:`)).toBeTruthy();
    const unchecked = (screen.getAllByRole('checkbox') as HTMLInputElement[]).filter((b) => !b.checked);
    expect(unchecked.every((b) => b.disabled)).toBe(true);
  });

  it('allows bonus picks from Magnificent Specimen', () => {
    renderSection(2, openIds(config.pickCount));
    expect(screen.getByText(`Pick ${config.pickCount + 2} more:`)).toBeTruthy();
    const unchecked = (screen.getAllByRole('checkbox') as HTMLInputElement[])
      .filter((b) => !b.checked && b.getAttribute('aria-label') === null);
    expect(unchecked.some((b) => !b.disabled)).toBe(true);
  });
});
