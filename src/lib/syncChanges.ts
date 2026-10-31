import { isPlainObject } from './typeGuards';

export type PathPart = string | { id: string };
export interface FieldChange {
  path: PathPart[];
  before?: unknown;
  after?: unknown;
}

export const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameValue(a[key], b[key]));
  }
  return false;
};

const idArray = (value: unknown): value is { id: string }[] => Array.isArray(value)
  && value.every((item) => isPlainObject(item) && typeof item.id === 'string')
  && new Set(value.map((item) => item.id)).size === value.length;

// Paths use persisted entity IDs, never array indices. Arrays without IDs are
// deliberately compared as one field: positional merging would guess intent.
export const diffValues = (before: unknown, after: unknown, path: PathPart[] = []): FieldChange[] => {
  if (sameValue(before, after)) return [];
  if (isPlainObject(after) && (isPlainObject(before) || (before === undefined && typeof path[path.length - 1] === 'string'))) {
    const previous = isPlainObject(before) ? before : {};
    return [...new Set([...Object.keys(previous), ...Object.keys(after)])]
      .flatMap((key) => diffValues(previous[key], after[key], [...path, key]));
  }
  if ((idArray(before) || before === undefined) && idArray(after)) {
    const previous = new Map((before ?? []).map((v) => [v.id, v]));
    const next = new Map(after.map((v) => [v.id, v]));
    return [...new Set([...previous.keys(), ...next.keys()])]
      .flatMap((id) => diffValues(previous.get(id), next.get(id), [...path, { id }]));
  }
  return [{ path, before, after }];
};

export const readPath = (root: unknown, path: PathPart[]): unknown => path.reduce<unknown>((value, part) => {
  if (typeof part === 'string') return isPlainObject(value) ? value[part] : undefined;
  return Array.isArray(value) ? value.find((v) => isPlainObject(v) && v.id === part.id) : undefined;
}, root);

const writePath = (root: unknown, path: PathPart[], value: unknown): unknown => {
  if (path.length === 0) return value;
  const [part, ...rest] = path;
  if (typeof part === 'string') {
    if (['__proto__', 'prototype', 'constructor'].includes(part)) throw new Error('Invalid field path.');
    const next = isPlainObject(root) ? { ...root } : {};
    const updated = writePath(next[part], rest, value);
    if (updated === undefined) delete next[part];
    else next[part] = updated;
    return next;
  }
  const next = Array.isArray(root) ? [...root] : [];
  const index = next.findIndex((item) => isPlainObject(item) && item.id === part.id);
  // Editing a deleted entity is not creation, including during local projection.
  if (index < 0 && rest.length > 0) return next;
  const updated = writePath(index < 0 ? undefined : next[index], rest, value);
  if (index < 0) { if (updated !== undefined) next.push(updated); }
  else if (updated === undefined) next.splice(index, 1);
  else next[index] = updated;
  return next;
};

export const missingParent = (root: unknown, path: PathPart[]): boolean => path.some((part, i) =>
  typeof part !== 'string' && i < path.length - 1 && readPath(root, path.slice(0, i + 1)) === undefined);

export const applyChanges = <T>(root: T, changes: FieldChange[], check = false): T => {
  let next: unknown = root;
  for (const change of changes) {
    // A blur, another sender, or another user can already have applied the
    // same assignment. It is a no-op, not a conflicting overwrite.
    if (!missingParent(next, change.path) && sameValue(readPath(next, change.path), change.after)) continue;
    if (check && (missingParent(next, change.path) || !sameValue(readPath(next, change.path), change.before))) {
      throw new EditConflict('This field changed on another screen.');
    }
    next = writePath(next, change.path, change.after);
  }
  return next as T;
};

export class EditConflict extends Error {}

// Coalesce repeated typing only while it is unsent. A frozen network batch is
// immutable and retains its own receipt ID until acknowledgment.
export const composeChanges = (previous: FieldChange[], incoming: FieldChange[]): FieldChange[] => {
  const next = [...previous];
  for (const change of incoming) {
    const key = JSON.stringify(change.path);
    const i = next.findIndex((old) => JSON.stringify(old.path) === key);
    if (i >= 0 && sameValue(next[i].after, change.before)
      && next.slice(i + 1).every((other) => !pathsOverlap(other.path, change.path))) {
      next[i] = { ...next[i], after: change.after };
    } else next.push(change);
  }
  return next.filter((change) => !sameValue(change.before, change.after));
};

export const pathsOverlap = (a: PathPart[], b: PathPart[]): boolean =>
  a.slice(0, Math.min(a.length, b.length)).every((part, i) => sameValue(part, b[i]));

export const pathLabel = (path: PathPart[]): string => path.map((part) => typeof part === 'string' ? part : part.id).join(' / ');
