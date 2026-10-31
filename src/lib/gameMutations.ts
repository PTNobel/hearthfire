// Merge against the caller's ORIGINAL list, then diff that result into ID-based
// edits. Never apply a stale full list directly to a freshly read shared game:
// untouched entries in that list are not edit intent.
export const mergeById = <T extends { id: string }>(
  existing: T[] | undefined,
  incoming: T[],
  removedIds?: string[],
): T[] => {
  const incomingIds = new Set(incoming.map((e) => e.id));
  const removed = new Set(removedIds ?? []);
  const onlyInExisting = (existing ?? []).filter((e) => !incomingIds.has(e.id) && !removed.has(e.id));
  return [...incoming, ...onlyInExisting];
};

// Strip undefined-valued keys (e.g. parsed NPCs' optional fields, or debilities'
// untouched keys from parseDebilities) before writing to Firestore, which rejects
// undefined values outright.
export const stripUndefined = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Steading array fields diffed by ID against the caller’s original list,
// each paired with its SteadingData sentinel field for explicit-removal ids.
export const STEADING_ID_ARRAY_FIELDS = {
  residents: 'removedResidentIds',
  neighbors: 'removedNeighborIds',
  gmImprovements: 'removedGmImprovementIds',
} as const;
