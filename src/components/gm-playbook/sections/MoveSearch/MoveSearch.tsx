import { useState, useMemo, useId } from 'react';
import { Input, Text, PlaybookColumns } from '@/components/ui';
import { Move } from '@/components/character/Move/Move';
import { BASIC_MOVES, SPECIAL_MOVES, FOLLOWER_MOVES, HOMEFRONT_MOVES, EXPEDITION_MOVES } from '@/lib/moves';
import { ALL_PLAYBOOK_MOVES } from '@/lib/moves/allPlaybookMoves';
import { LIGHTBEARER_INVOCATIONS } from '@/lib/moves/lightbearerInvocations';
import { REVENANT_MOVES, GHOST_MOVES, THRALL_MOVES, THRALL_MARK_DEFINITIONS } from '@/lib/moves/inserts';
import type { MoveDefinition } from '@/types';
import { moveSearchText, normalizeMoveSearchText } from '@/lib/moves/moveSearchText';
import styles from './MoveSearch.module.css';

const ALL_MOVES = [
  ...BASIC_MOVES,
  ...SPECIAL_MOVES,
  ...FOLLOWER_MOVES,
  ...HOMEFRONT_MOVES,
  ...EXPEDITION_MOVES,
  ...Object.values(ALL_PLAYBOOK_MOVES).flat(),
  ...LIGHTBEARER_INVOCATIONS,
  ...REVENANT_MOVES,
  ...GHOST_MOVES,
  ...THRALL_MOVES,
  ...THRALL_MARK_DEFINITIONS,
].sort((a, b) => a.name.localeCompare(b.name));

// Precompute the searchable text once, not on every keystroke.
const SEARCHABLE_MOVES = ALL_MOVES.map((move) => ({ move, text: moveSearchText(move) }));

const MoveList = ({ moves }: { moves: MoveDefinition[] }) => (
  <ul className={styles.list}>
    {moves.map((move) => (
      <li key={move.id} className={styles.item}>
        <Move title={move.name} move={move} />
      </li>
    ))}
  </ul>
);

export const MoveSearch = () => {
  const [query, setQuery] = useState('');
  const resultHintId = useId();

  const results = useMemo(() => {
    const q = normalizeMoveSearchText(query);
    if (!q) return [];
    return SEARCHABLE_MOVES.filter(({ text }) => text.includes(q)).map(({ move }) => move);
  }, [query]);

  const mid = Math.ceil(results.length / 2);
  const leftCol = results.slice(0, mid);
  const rightCol = results.slice(mid);

  return (
    <div className={styles.root}>
      <Input
        placeholder="Search move names and text…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search moves by name or text"
        aria-describedby={query.trim() ? resultHintId : undefined}
        className={styles.input}
      />
      <div id={resultHintId} aria-live="polite" aria-atomic="true">
        {query.trim() && (
          results.length === 0
            ? <Text font="serif" color="muted" className={styles.empty}>No moves match "{query}".</Text>
            : <Text as="span" className={styles.visuallyHidden}>{results.length} move{results.length === 1 ? '' : 's'} found.</Text>
        )}
      </div>
      {results.length > 0 && (
        <section aria-label="Move search results" className={styles.results}>
          <PlaybookColumns
            left={<MoveList moves={leftCol} />}
            right={rightCol.length > 0 ? <MoveList moves={rightCol} /> : undefined}
          />
        </section>
      )}
    </div>
  );
};
