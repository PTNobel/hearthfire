# Hearthfire

A digital companion for [Stonetop](https://www.kickstarter.com/projects/1956101682/stonetop) — the tabletop RPG by Jeremy Strandberg. Hearthfire lets your whole party manage characters, share game state, and reference playbook content in real time, all from the browser.

**Live:** [hearthfire.camp](https://hearthfire.camp)

---

## Features

- **Private shared session** — only the configured session ID can be read or created; never exposed in navigation URLs
- **Character sheets** — full digital playbooks for all 9 character classes, with persistent form fields
- **GM playbook** — quick-reference material for the Gamemaster
- **Real-time sync** — Firestore keeps every player's view in sync without a page refresh
- **No account required** — Firestore enforces the private game ID
- **Shared map** — open your group's Miro board from any game page

---

## Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Framework | React 19 + TypeScript            |
| Build     | Vite                             |
| Routing   | React Router v7                  |
| Database  | Firebase Firestore               |
| Testing   | Vitest + Testing Library         |
| Styling   | CSS Modules + clsx               |
| Hosting   | Firebase Hosting (custom domain) |

---

## Getting Started

### Prerequisites

- Node.js 24+ (see `.nvmrc`; enforced by `engines` in `package.json`)
- A Firebase project with Firestore enabled

### Installation

```bash
git clone git@github.com:gvorbeck/hearthfire.git
cd hearthfire
npm install
```

### Environment Variables

Copy the example env file and fill in your Firebase project credentials:

```bash
cp .env.example .env
```

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_MIRO_BOARD_URL= # optional: HTTPS link to your shared Miro board
```

### Development

```bash
npm run dev
```

Starts a Vite dev server at `http://localhost:5173`.

### Testing

```bash
npm test
```

Runs the full test suite once with [Vitest](https://vitest.dev). For watch mode during development:

```bash
npm run test:watch
```

Unit tests use jsdom and `@testing-library/react`, with mocked Firebase and IndexedDB — no `.env` required. CI also runs real Firestore security rules and Chromium synchronization tests:

```bash
# Requires Node 24 and Java 21. Uses only the demo-hearthfire emulator.
npx playwright install chromium
npm run test:sync
```

The browser suite covers a complete persistent-browser restart with Firestore unreachable, notes typed before a failed lock claim, simultaneous NPC edits, conflict resolution, deleted entities, form recovery, and tabs sharing remembered access. Its separate Vite entry point uses dummy Firebase configuration and is not included in production builds.

### Production Build

```bash
npm run build
```

Output goes to `dist/`. Preview the build locally with:

```bash
npm run preview
```

---

## Project Structure

```
src/
├── components/
│   ├── ui/               # Design-system atoms (Button, Input, Checkbox, PlaybookColumns, …)
│   ├── app/              # App chrome (ErrorBoundary, GameGuard, PageHeader, PageLayout, …)
│   ├── character/        # Character sheet sections and per-playbook overrides
│   ├── gm-playbook/      # GM playbook sections
│   └── fields/           # Form field composites (RepeaterField, TagInput)
├── hooks/
│   ├── useGame.ts        # Game state: load, update, add characters
│   └── useDebouncedSave.ts
├── lib/
│   ├── firebase.ts       # Firestore client
│   ├── constants.ts      # Playbook definitions
│   └── game.ts           # Game creation helpers
├── pages/
│   ├── Home/             # Create or join a game
│   ├── Game/             # Party roster and session hub
│   ├── CharacterPlaybook/ # Individual character sheet
│   └── GmPlaybook/       # GM reference
└── types/
    └── index.ts          # Shared TypeScript types
```

---

## Firebase Setup

Hearthfire uses Firestore (no individual authentication). The database structure is:

```
games (collection)
└── {gameId} (document)
    ├── id: string
    ├── name: string
    ├── createdAt: timestamp
    ├── characters: CharacterData[]
    ├── content: ContentLists
    ├── threats: string
    └── iWonder: string
```

Only the deployment-configured session ID can be read or written. Listing and deleting games are denied.

---


## Private single-session deployment

This fork restricts all Firestore reads and writes to exactly one game ID. The ID is a shared **bearer secret**: anyone who knows it can view and edit the campaign. There are no individual accounts.

1. Create a **separate** Firebase project, enable Firestore and Hosting, and register a web app.
2. In this repository's GitHub **Settings → Secrets and variables → Actions**, create `HEARTHFIRE_SESSION_ID` (16–128 lowercase letters, digits, hyphens or underscores; ideally `openssl rand -hex 16`).
3. Set the six `VITE_FIREBASE_*` GitHub Actions secrets described above for **your** Firebase web app, plus `FIREBASE_SERVICE_ACCOUNT` with a service-account JSON key that can deploy Firebase Hosting and Firestore rules.
4. Merge the patch into `main`. The workflow builds the site and deploys it along with its restricted Firestore rules.
5. Share the session ID **separately** with your players. Entering it on the home page creates the game on first use and opens it thereafter. Invalid IDs cause a Firestore `permission-denied` error. The app remembers the ID in `localStorage` and navigates only to `/game`, `/game/gm`, `/game/steading`, and `/game/:playbook`.

For local deployment, set `HEARTHFIRE_SESSION_ID` in your shell, run `npm run render:rules` and `npm run build`, then:

```bash
firebase deploy --only hosting,firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

Firestore Security Rules cannot read runtime environment variables. The render script substitutes the ID at **deployment time** into `.firebase/firestore.rules`, which is gitignored. The checked-in `firestore.rules` is a deny-all template. The ID must **not** be placed in a `VITE_*` variable (those are bundled into public JavaScript).

**A URL does not grant access.** The game ID is kept in `localStorage`, not in routes, the page header, or shared links. Tabs using the same site origin and browser profile share remembered access, which survives browser restarts. The home page offers **Continue game** and **Forget this device**. Forgetting clears remembered access across open tabs; it does not revoke the shared ID or erase Firestore's offline cache. Other devices, profiles, and site origins still need the ID. Existing tab-only sessions migrate automatically without restoring access explicitly forgotten in another tab.

Firestore still receives the ID as the document path, so it remains a bearer credential; treat it as a password. Do not use a short or guessable session name. If you change the ID, the old game data remains at its old Firestore document path and will not be readable under the new ID.

---

## Deployment

### Link a shared Miro map

Create a Miro board and choose **Share → Copy board link**. In this repository's [Actions variables](https://github.com/PTNobel/hearthfire/settings/variables/actions), set `VITE_MIRO_BOARD_URL` to the full `https://miro.com/app/board/...` URL (or a Miro welcome link).

After the next deployment, **Map** appears in the top bar of all game pages, opening the board in a new tab. If the variable is absent, the Map link stays hidden. For local development, you can set the same variable in `.env`. No Miro SDK, map editor, Firebase Storage, or additional Firebase permissions are required.

**Privacy:** Vite embeds this URL into public frontend JavaScript, even though the link is only shown inside game pages. Treat it as public. Restrict board access in Miro rather than relying on the link being secret. On Miro's Free plan, public visitors have view-only access; edit access can instead be granted to team members.

### Choose your Hosting URL

In Firebase console, under **Hosting**, create a new site with an available site ID such as `hearthfire-velt`; its URL will be `https://hearthfire-velt.web.app`. This can be an additional Hosting site in your existing Firebase project; you do not need to create a new project or run `firebase init`.

In [repository Actions variables](https://github.com/PTNobel/hearthfire/settings/variables/actions), add `FIREBASE_HOSTING_SITE_ID` with the **exact** site ID you created (not the complete URL and not your Firebase project ID). This is a nonsecret variable. The deploy workflow configures the `hearthfire` target automatically and deploys only to that site, while keeping Firestore in your existing Firebase project.

After configuring the secrets and this variable, pushes to `main` deploy Hosting and the generated Firestore rules to your Firebase project.

---

## License

This project is unofficial fan content. _Stonetop_ is designed by Jeremy Strandberg. All game content belongs to its respective owners. This tool is not affiliated with or endorsed by the Stonetop team.

This project is released under the [CC BY-SA 4.0 License](LICENSE).

---

## Artwork & Trade Dress

The playbook icons, Seasons Change move icons, and monster/artifact/etc. icons used in this project are part of the official _Stonetop_ trade dress. Jeremy Strandberg has [confirmed](https://discord.com/channels/538756448914767872/825767574176137226/1506483106109063208) that the trade dress is free to use in fan projects, provided any such works are released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) with proper attribution.

Maps and illustrations by Lucie Arnoux are copyright and are **not** included in this project.


## Saving and recovery

Autosaved changes are accepted into IndexedDB immediately. A 750 ms quiet period coalesces unsent edits before the server transaction; a pending network request never blocks newer local drafts. Local transactions request strict durability. The sender keeps an immutable batch until the server acknowledges it, then atomically records the confirmed game baseline and removes the batch. This also covers a browser restart before Firestore's own snapshot cache catches up.

The header distinguishes **Saving on this device**, **Saved on this device**, **Syncing**, **Saved**, **Sync failed**, and **Needs review**. “Saved” means submitted edits have server confirmation. Open NPC forms show their own local-draft status and require **Save NPC** to submit. Failed local storage is explicitly marked **Draft not saved**; keep the page open, retry, or download recovery data. Browser storage can still be cleared or evicted, so local drafts are not a backup.

Click the status to retry, download the saved drafts, or compare competing versions. Independent fields and ID-based entities merge. Competing changes to the same field require an explicit choice. Editing a deleted entity never recreates it automatically. Lists without persistent item IDs are compared as one field. Character ordering changes only IDs/order and keeps newly added characters; concurrent reorderings use the last committed order. Stat adjustments are additive events.

Notes use a fresh token for each editing hold, plus original-content checks. A failed claim preserves typing. An obsolete token cannot release a newer hold or overwrite its notes. The indicator does not treat lock acquisition or heartbeats as content saves. Notes remain whole-document edits, not collaborative character-by-character merging; advisory expiry still depends on device clocks.

Unsubmitted NPC forms have separate records for each open form and offer explicit recovery after navigation/reload. Cancel leaves that saved copy available; **Discard saved copy** removes the selected recovery record. Recovering a copy does not erase another tab's active draft. “Forget this device” removes only remembered access across tabs. It neither reads a credential back from drafts nor deletes drafts or offline game data. To erase all local data, first sync/export anything needed, then clear this site's browser storage.

### Synchronization protocol and deployment

Deploy the client and `firestore.rules` together. Games gain `sync: { protocol: 2, generation, revision, lastWrite? }` on their first new-client write. Rules require a revision increment, preventing older open tabs from bypassing conflict checks. Those tabs must reload before saving; finish existing work before deployment. A racing commit can be rejected by the revision rule; the client retries only after an authorized server read proves the revision advanced.

Each accepted batch atomically creates `games/{gameId}/writes/{batchId}`. This receipt prevents replay after a crash, including duplicate stat adjustments. It adds a receipt read/write per batch; receipts are deliberately retained while old devices may retry. Do not prune receipts without also retiring the corresponding game generation. Backups contain game data, not local drafts or receipts. Both the in-app restore and `scripts/restore.ts` create a fresh generation and clear notes holds; old drafts require review instead of replaying into restored data. Client restore also checks the revision it began with.

The game remains one Firestore document. Moving characters or notes into separate documents requires a separate measured migration; this change does not claim reduced production contention or network latency.


The Node tooling pins `@grpc/grpc-js` to 1.14.7 through an npm override because the Firebase dependency tree still requests an older release. This includes the fixes for [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) and [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4). Remove the override when the upstream constraint permits a patched release; the browser uses Firebase's web transport.
