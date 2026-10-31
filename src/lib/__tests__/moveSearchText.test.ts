import { describe, expect, it } from 'vitest';
import type { MoveDefinition } from '@/types';
import { moveSearchText, normalizeMoveSearchText } from '../moves/moveSearchText';

describe('move search indexing', () => {
  it('includes the title, paragraphs, lists, and both kinds of checklists', () => {
    const move: MoveDefinition = {
      id: 'internal-id-not-for-search',
      name: 'Unquiet Paths',
      body: [
        { kind: 'para', text: 'When you **cross the moonlit bridge**, roll +WIS.' },
        { kind: 'list', items: ['Choose the ***hidden doorway***', 'Follow the river'] },
        { kind: 'checkbox', items: [{ id: 'checkbox-1', label: 'Mark the secret chamber' }] },
        { kind: 'tracked', items: [{ id: 'tracked-1', label: 'Learn the ancient language' }] },
        { kind: 'divider' },
      ],
    };
    const text = moveSearchText(move);
    expect(text).toContain('unquiet paths');
    expect(text).toContain('cross the moonlit bridge');
    expect(text).toContain('hidden doorway');
    expect(text).toContain('secret chamber');
    expect(text).toContain('ancient language');
    expect(text).not.toContain('internal-id-not-for-search');
  });

  it('handles moves without a body and normalizes whitespace and case', () => {
    expect(moveSearchText({ id: 'bare', name: 'Ravenous' })).toBe('ravenous');
    expect(normalizeMoveSearchText('  CROSs   THE  moonlit  ')).toBe('cross the moonlit');
  });
});
