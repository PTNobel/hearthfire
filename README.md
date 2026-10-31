# Hearthfire

A digital companion for [Stonetop](https://www.kickstarter.com/projects/1956101682/stonetop) — the tabletop RPG by Jeremy Strandberg. Hearthfire lets your whole party manage characters, share game state, and reference playbook content in real time, all from the browser.

**Live:** [hearthfire.camp](https://hearthfire.camp)

---

## Features

- **Private shared session** — only the configured session ID can be read or created
- **Character sheets** — full digital playbooks for all 9 character classes, with persistent form fields
- **GM playbook** — quick-reference material for the Gamemaster
- **Real-time sync** — Firestore keeps every player's view in sync without a page refresh
- **No account required** — Firestore enforces the private game ID

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

Tests use jsdom + `@testing-library/react`. All Firebase calls are mocked — no `.env` required to run tests. The CI pipeline runs `npm test` on every pull request to `main` before building.

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
5. Share the session ID with your players. Entering it on the home page creates the game on first use and opens it thereafter. Invalid IDs cause a Firestore `permission-denied` error.

For local deployment, set `HEARTHFIRE_SESSION_ID` in your shell, run `npm run render:rules` and `npm run build`, then:

```bash
firebase deploy --only hosting,firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

Firestore Security Rules cannot read runtime environment variables. The render script substitutes the ID at **deployment time** into `.firebase/firestore.rules`, which is gitignored. The checked-in `firestore.rules` is a deny-all template. The ID must **not** be placed in a `VITE_*` variable (those are bundled into public JavaScript).

The ID also appears in the shared game URL; treat the link as a password. Do not use a short or guessable session name. If you change the ID, the old game data remains at its old Firestore document path and will not be readable under the new ID.

---

## Deployment

After you configure the secrets above, pushes to `main` deploy Hosting and the generated Firestore rules to your Firebase project.

---

## License

This project is unofficial fan content. _Stonetop_ is designed by Jeremy Strandberg. All game content belongs to its respective owners. This tool is not affiliated with or endorsed by the Stonetop team.

This project is released under the [CC BY-SA 4.0 License](LICENSE).

---

## Artwork & Trade Dress

The playbook icons, Seasons Change move icons, and monster/artifact/etc. icons used in this project are part of the official _Stonetop_ trade dress. Jeremy Strandberg has [confirmed](https://discord.com/channels/538756448914767872/825767574176137226/1506483106109063208) that the trade dress is free to use in fan projects, provided any such works are released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) with proper attribution.

Maps and illustrations by Lucie Arnoux are copyright and are **not** included in this project.
