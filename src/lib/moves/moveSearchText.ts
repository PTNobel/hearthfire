import type { MoveDefinition, MoveBlock } from '@/types';

// Strip inline Markdown delimiters so a phrase typed normally can match text
// even when a word in the move is bold or italic.
export const normalizeMoveSearchText = (text: string): string =>
  text.toLowerCase().replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();

const blockText = (block: MoveBlock): string[] => {
  switch (block.kind) {
    case 'para': return [block.text];
    case 'list': return block.items;
    case 'checkbox':
    case 'tracked': return block.items.map((item) => item.label);
    case 'divider': return [];
  }
};

export const moveSearchText = (move: MoveDefinition): string =>
  normalizeMoveSearchText([move.name, ...(move.body ?? []).flatMap(blockText)].join(' '));
