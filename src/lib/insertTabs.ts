import { lazy, type ComponentType } from 'react';
import type { PlaybookFeatures, PlaybookSectionProps } from '@/types';
import type { FollowerNpcs } from '@/components/character/playbooks/followers/followerNpcs';

// A user-addable "insert": an optional sheet section a player can attach to any character
// (Revenant, Ghost, …). Distinct from the playbook-specific sections and tabs in
// CharacterPlaybook, which are fixed by the character's playbook and can't be added or removed.
// Everything an insert needs is declared here — its add-modal option, the tab that renders it,
// and the cleanup its removal requires — so adding one is a single edit to INSERT_TABS.
export type InsertTabDefinition = {
  // PERSISTED in CharacterData.inserts on live Firestore documents. Never change an id — the
  // display `label` is a separate field precisely so wording can change without touching data.
  id: string;
  label: string;
  Component: ComponentType<PlaybookSectionProps & { followerNpcs?: FollowerNpcs }>;
  // playbookFeatures keys this insert owns, deleted when the insert is removed. Naming them is
  // required, not cosmetic: updateCharacterData's merge is additive, so a key merely omitted from
  // the patch survives the spread and reappears from the freshly-read doc (issue #241).
  deleteFeatureKeys?: readonly (keyof PlaybookFeatures)[];
  // Extra sentence shown in the remove-confirmation modal, for inserts whose removal destroys
  // data the player entered by hand.
  removeWarning?: string;
};

// One lazy() per insert, each pointing at its own module, so every insert stays in its own Rollup
// chunk — a character sheet only downloads the inserts that character actually has. Tabs gates
// mounting on first activation, so a chunk is fetched exactly when its tab is first opened.
export const INSERT_TABS = [
  {
    id: 'Revenant',
    label: 'Revenant',
    Component: lazy(() => import('@/components/character/playbooks/revenant/RevenantInsert').then((m) => ({ default: m.RevenantInsert }))),
  },
  {
    id: 'Ghost',
    label: 'Ghost',
    Component: lazy(() => import('@/components/character/playbooks/ghost/GhostInsert').then((m) => ({ default: m.GhostInsert }))),
  },
  {
    id: 'Thrall',
    label: 'Thrall',
    Component: lazy(() => import('@/components/character/playbooks/thrall/ThrallInsert').then((m) => ({ default: m.ThrallInsert }))),
  },
  {
    id: 'Followers',
    label: 'Followers',
    Component: lazy(() => import('@/components/character/playbooks/followers/FollowersInsert').then((m) => ({ default: m.FollowersInsert }))),
    deleteFeatureKeys: ['followers'],
    removeWarning: 'All follower entries and their stats will be removed. Linked NPCs will remain in Steading.',
  },
] as const satisfies readonly InsertTabDefinition[];

export type InsertOption = typeof INSERT_TABS[number]['id'];

// The one insert the app adds on the player's behalf (a dog possession implies followers), so
// useAutoFollowers needs to name it. Typed against the union rather than inlined at the call
// site: renaming or dropping the registry entry then fails the build instead of quietly
// no-op'ing at runtime.
export const FOLLOWERS_INSERT_ID: InsertOption = 'Followers';

// Look up a definition by the id persisted in CharacterData.inserts. Undefined for an
// unrecognised id — a doc can name an insert this build doesn't have — so callers must handle it.
export const getInsertTab = (id: string): InsertTabDefinition | undefined =>
  INSERT_TABS.find((insert) => insert.id === id);
