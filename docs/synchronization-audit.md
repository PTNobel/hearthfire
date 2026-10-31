# Synchronization audit

Audited revision: [`f9d9332`](https://github.com/PTNobel/hearthfire/commit/f9d93322e8d16ed3155e04fc6efc5be220279739), on `improve-performance-typography` / PR #8. The findings below describe that audited baseline. The implementation status here records the subsequent repair in PR #8.

The central problem is the boundary between a local draft, a submitted write, and an acknowledged write. Several components use different definitions of “saved,” and some mutations send stale values for fields the user did not change. The previous debounce and notification fixes help, but do not cover these independent paths.

## Implementation status

The repair replaces the separate network debounce/promise chains with a shared IndexedDB draft queue. Every autosave records its intent locally before waiting for the network. Unsent assignments coalesce; frozen batches have immutable IDs and server receipts. Queue cleanup and the confirmed game baseline commit in one strict local transaction. This closes both the original lost-second-draft failure and a newly reproduced acknowledgment/cache gap during browser restart.

Mutations now compare original field values and persistent entity IDs inside the server transaction. NPC/arcana/improvement forms pass their edit baseline explicitly. Independent edits merge, while competing values and deleted parents become recoverable conflicts. Notes have per-acquisition tokens, failed claims preserve typing, and lock-only writes do not report content saved. NPC forms persist separately, failed renames stay open, input-specific timers have been consolidated, and Home initializes the remembered theme.

Protocol-2 metadata and revision-enforcing rules reject older unconditional writers. Real simultaneous-browser tests exposed that a revision-rule race can surface as `permission-denied` before the SDK reports a stale precondition. The client performs an authorized server read and retries only when the revision actually advanced. True permission failures remain failures. Backup restores establish a new generation and clear leases.

Regression coverage includes pure intent/diff tests, durable-queue and hook tests, security-rule emulator tests, and persistent Chromium tests against the real SDK/emulator. The CI synchronization job uses a dummy project and never writes to the live campaign. The historical 695-test count below describes the pre-repair baseline; current suite results belong to the PR/CI run.

The production entry chunk is smaller after lazy-loading the session store. Runtime profiling and a possible document split remain future work; no production latency or contention improvement is claimed. Browser storage eviction, clearing site data, and device-clock effects on advisory notes expiry remain limitations. Conflict choices are explicit rather than automatic rich-text merging.

## Evidence and limits

- Nine desired-behavior assertions failed on the audited code: four initial component/hook reproductions and five additional cases in an isolated source archive. The assertion failures, rather than build or setup failures, demonstrate the defects below.
- A Chromium experiment used the installed Firebase SDK, persistent cache, disabled networking, the real `useDebouncedSave` hook, and a dummy project. A complete browser restart recovered the first draft but lost the newer draft waiting in the hook's promise chain. It made no writes to a live game. This is a focused integration reproduction, not a full offline end-to-end test of every field.
- Two existing passing tests explicitly encode unsafe notes behavior: discarding edits after a claim error, and writing notes after another client has taken the lock.
- The existing 695-test CI suite passed at this revision. Its in-memory Firestore mock does not model server acknowledgment delays, persistence across browser restarts, or transaction isolation/retries. Green CI therefore does not contradict these findings.
- Performance effects described below follow from the code path; no production latency, contention rate, or render-time improvement was measured in this audit.

## Confirmed failures

| Priority | Trigger and observed result | Mechanism and location |
| --- | --- | --- |
| P1 | Submit draft A offline, then submit B while A is pending; restart the browser. A survives, B does not. | `useDebouncedSave` serializes calls behind acknowledgment of the previous write. B remains only in the JavaScript promise chain and never reaches the SDK cache. `src/hooks/useDebouncedSave.ts` |
| P1 | Client A edits NPC A. Client B, holding the old list, edits NPC B. A's edit is reverted. | `mergeById` gives every incoming object precedence, including untouched stale objects. A transaction rereads current data, then replaces it with those objects. `src/lib/gameMutations.ts`, `src/hooks/useGame.ts`, `SteadingNPCs.tsx` |
| P1 | Delete NPC A; a stale client edits NPC B and submits its list. NPC A returns. | An incoming ID absent from the current list is treated as an addition. Deletion sentinels exist only in the deleting request. The writer cannot distinguish a new entity from a stale copy of a deleted entity. Same mutation path as above. |
| P1 | A notes lock claim fails. The editor discards the local typing. | Rejected promises and a legitimate “someone else holds the lock” result share `rejectClaim`; it clears dirty state and restores remote HTML. `src/hooks/useNotesLock.ts`, `NotesEditor.tsx` |
| P1 | Another tab takes a notes lock; the old holder later releases with stale HTML. Its HTML is still written. | `releaseNotesLock` checks ownership only to decide whether to clear the lock. It always writes the content. The separate blur-save `updateNotes` checks no owner or content version. `src/hooks/useGame.ts` |
| P1 | A failed inventory or repeater save is followed by a changed remote value. The draft disappears from the input. | `OtherThingsField` clears its independent pending gate in `finally`; `RepeaterField` assigns `lastSavedRef` before awaiting the save. Both can accept remote data while their draft is still unsaved. |
| P2 | Save repeater value B, receive remote C, deliberately enter B again. No second persistence call occurs. | The debounce hook still remembers B as saved. The repeater never calls `noteRemoteValue` to invalidate that deduplication state. `RepeaterField.tsx`, `useDebouncedSave.ts` |
| P2 | Optimistically change 0 to 1 to 2; both writes fail in that order. The UI ends at 1. | Each failure remembers its own previous optimistic value. The second rollback restores a value whose own save failed. `src/hooks/useOptimisticField.ts` |
| P2 | Acquire a notes editing lock while the text remains unsaved. The header says “Saved.” | Lock acquisition goes through `reportSave`; notes typing does not register a draft with the save-status provider. `src/hooks/useGame.ts`, `useNotesLock.ts` |
| P2 | Rename a game/character, then fail the save. The editor closes and reopening restores the old title. | `PageHeader.commit` closes in `finally`. The failed value is no longer available in the editing flow. `src/components/app/PageHeader/PageHeader.tsx` |
| P3 | Save the light theme and reload directly onto Home. The saved theme is not applied. | Theme initialization lives in the toggle, which the simple Home header does not mount. `src/hooks/useColorScheme.ts`, `PageHeader.tsx` |

P1 means user-content loss or unintended restoration deserves first attention. It is not a claim that each case affects every save or every user.

## Related paths established by source inspection

NPCs, arcana, and GM improvements use whole-array payloads with the same merge helper. The deterministic stale-list reproduction exercised NPCs; the shared mechanism and full-list callers put the other two paths at risk as well.

NPC forms also close immediately after invoking a void callback. The callback's optimistic save catches failures internally, so simply adding `await` to the modal would not be sufficient. Its caller contract must expose failure or durable acceptance, and the form must remain recoverable.

`OtherThingsField` is not the only caller maintaining its own pending flag. Save-hook consolidation needs a caller-by-caller audit. A shared hook cannot protect a field whose remote synchronization uses a separate flag.

Notes have a per-tab client ID, but no token distinguishing two successive acquisitions by that same tab. An old asynchronous release can therefore be mistaken for the current hold. Lease expiry also uses two different clock models: the UI measures time since receiving a heartbeat, whereas acquisition compares clocks from different devices. These are additional protocol weaknesses, not separately reproduced browser failures in this audit.

## Why persistence and transactions do not solve this automatically

Firestore caches submitted writes and synchronizes them after reconnecting. It cannot persist a newer value still waiting in an application-owned promise chain. The browser experiment observed:

```json
{
  "inMemory": "latest draft",
  "queued": { "value": "first draft" },
  "calls": ["first draft"],
  "afterRestart": { "value": "first draft" }
}
```

Character and steading mutations introduce another distinction: they use transactions, which fail offline. Enabling persistent cache does not make those transactions a durable application outbox.

A transaction also cannot infer edit intent. In the NPC reproduction, the second operation ran after the first had committed. It read the updated server list correctly, but then applied the stale incoming objects. No simultaneous execution is required to trigger the loss.

Primary references: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) and [offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

## Proposed editing contract

Working recommendation: preserve local drafts and retain the existing single-editor notes experience. Offline notes become recoverable local work; they do not imply ownership of the shared note. Live simultaneous rich-text editing would be a separate product and protocol change.

1. **Draft durability is independent of network submission.** Persist the latest draft before treating it as safe on the device. Record its target, base value/version, desired value, and local revision. Separate drafts from different tabs so they cannot overwrite one another in the local store.
2. **Acknowledgment belongs to a specific revision.** A successful write of revision 4 must not clear revision 5. Keep the newest draft even while an older request waits for the server.
3. **Writes express changes.** Send an NPC ID and changed fields, with expected base values, rather than the old list. Make create, update, and delete distinct operations. An update of a missing entity must become a recoverable conflict, not a create.
4. **Conflicts preserve both versions.** Apply disjoint field changes automatically. If the same field changed since the draft's base, retain the user's version and the current shared version and offer an explicit resolution. A generic retry must not silently overwrite the other version.
5. **Notes commits validate both ownership and content version.** Each acquired hold gets a fresh token. Blur, idle release, and explicit save use the same guarded commit path. A stale token cannot save or clear a newer hold. Claim failure retains the draft. Leases improve editing UX; version checks prevent stale writes.
6. **Retry rules distinguish values from events.** Consecutive unsent assignments to one field may be coalesced to the latest value. Stat deltas and other discrete actions require stable operation IDs and deduplication before replay. Preserve intentional ordering.
7. **Restoration and deletion invalidate obsolete work.** A restored game needs a generation/version boundary so pending drafts from the pre-restore game cannot silently replay over it. Entity deletion must not be undone by an old update.

For plain arrays without persisted row IDs, begin with conservative whole-field conflict detection. A later stable-ID migration can permit independent row edits. Do not infer identity from array position or text.

### Status and recovery UI

| State | Meaning and presentation |
| --- | --- |
| Editing | The latest change has not yet been confirmed durable locally. |
| Saved on this device | The latest draft is durable here; it still needs server acknowledgment. Add an offline qualifier when appropriate. |
| Syncing | Sending the durable draft or waiting for acknowledgment. |
| Saved | The server acknowledged the latest local revision for every relevant draft. |
| Needs review | A competing edit requires a choice; both versions are retained. |
| Could not save | Retain the draft and expose retry/recovery. If local persistence itself failed, say that the draft is not safe to close. |

Derive the header from draft records and revisions, not merely from the number of completed promises. Lock heartbeats/acquisition do not count as content saves. Ordinary saves need no toast; an actionable error can have one notification, while persistent field status supplies the recovery path.

Local draft retention also needs deliberate integration with “Forget this device.” Draft recovery must not silently restore forgotten game access. Existing remembered access and Firestore cached content are separate stores; the remembered-access change did not make drafts durable. Any new clear-device flow must handle unsynchronized drafts explicitly.

## Repair sequence

| Stage | Work | Exit evidence |
| --- | --- | --- |
| 1: Preserve failed work | Retain failed renames/forms and denied notes drafts; stop obsolete notes holders from writing; replace independent pending gates; fix repeater deduplication and optimistic rollback; exclude lock-only operations from content status. | Component/mutation regression cases pass. Rejection is observable by callers. Draft preservation is tested before showing a recovery action. |
| 2: Persist and recover drafts | Introduce a small shared draft store and revision-aware sender. Migrate save paths explicitly, including transactional fields. Restore unsynchronized drafts after restart. | Real SDK/browser tests cover offline edits, multiple revisions, restart, reconnect, and a local persistence failure. Two tabs retain separate conflicting drafts. |
| 3: Preserve edit intent | Migrate full-object/list payloads to explicit operations and base-value checks. Add note content versions and per-acquisition tokens. Add recovery UI for same-field conflicts and deleted entities. | Independent changes survive; stale edits do not resurrect deletions; an old notes holder cannot write; retries are idempotent. |
| 4: Reduce shared work | Profile snapshots, parsing, and rendering. Consider separating notes/leases, characters, and roll history into documents as justified by measurements. | Measured reduction in affected renders, parsing, and contention; migration and backup/restore compatibility verified. |

Theme initialization is a small independent fix. These stages overlap where needed: blocking a stale note write is only useful if its draft is retained and the user can recover it.

The initial correctness work can retain the current Firestore document layout. Splitting documents first would not correct stale payload semantics. Conversely, changing only clients cannot protect new behavior from an older open tab still performing unconditional writes; rollout needs a compatibility boundary, migration/version handling, and an old-tab reload path. Relevant rules, imports, backups, and restores must be updated alongside any schema changes.

## Performance implications

Notes locks, note content, characters, steading data, and roll history live in one game document. Every game snapshot is parsed into new objects by `useGame`. Character transactions read and rewrite the characters array; notes heartbeats touch the same document read by those transactions. This creates unnecessary shared work and opportunities for transaction retries.

Measure with a representative game and multiple active tabs before claiming a speedup. Candidate improvements are stable snapshot selectors, preserving unchanged object identities, and moving frequently changing notes/lease data away from character data. The existing save-status action-context split helps status-driven rerenders but does not remove snapshot-driven work.

## Acceptance scenarios

- Edit, then receive a remote value during debounce, during a pending write, after failure, and after retry exhaustion: the local draft remains recoverable.
- Save B, receive C, intentionally set B again: B is actually submitted.
- Submit A offline, continue typing B, restart the browser, reconnect: B is recovered and only cleared after its own acknowledgment.
- Fail two overlapping optimistic writes in both settlement orders: the UI cannot present another failed value as the confirmed baseline.
- Edit different NPCs from stale clients: both changes survive. Edit different fields on one NPC: both survive. Edit the same field: retain both versions for review.
- Delete an entity while another tab has an edit open: the old edit cannot recreate it implicitly.
- Fail or deny a notes claim: typed content survives. Expire a hold, acquire a new one, then settle an old release: new content and ownership survive.
- Acquire a notes lock with unsaved text: the header cannot say “Saved.” An unrelated successful write cannot hide an unresolved failed draft.
- Fail a rename or NPC save: the form remains available with its content and a usable recovery action.
- Restore a backup while old drafts exist: they cannot silently replay into the restored game.
- Forget remembered access with unsynchronized drafts present: apply the explicit recovery/retention policy without silently rejoining from draft metadata.
- Directly load Home with a stored theme: the stored theme applies.

Use deterministic hook/component tests for these invariants, an emulator for genuine concurrent transactions and rules, and real persistent-browser tests for offline/restart behavior. The current in-memory mock is useful for mutation logic but insufficient for the complete synchronization contract.
