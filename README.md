# github-categorizing-jev

A local, single-user application for organizing GitHub starred repositories with **Jev**, TypeSafe's decision model.

Define your categories, load repository metadata and READMEs into SQLite, and preview an independent membership probability for every repository/category pair. A repository can fit several categories; the probabilities do not need to add up to 100%.

**Preview only:** the application never creates GitHub Star Lists, changes list memberships, or stars/un-stars repositories.

## Pages

### Workspace

The workspace reads saved repositories from SQLite and requests your star total separately. Opening the page does not download all your stars.

**Load** combines repository discovery, metadata retrieval, README retrieval, and local persistence. Set a count for each run, or specify repositories directly:

| Mode                  | Behavior                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Continue              | Load the next batch from the saved GitHub pagination cursor, newest stars first.            |
| Latest                | Load your most recent stars without changing the Continue cursor.                           |
| Specific repositories | Load the starred repositories named as `owner/repo` or direct HTTPS GitHub repository URLs. |

A Load run accepts up to 1,000 repositories. GitHub pages contain at most 100, so larger runs request additional pages. Continue checkpoints each repository only after its metadata and README have been saved. A failure does not skip that repository. GitHub's Stars collection can change between runs; the cursor is a continuation point, not an immutable snapshot. Cached repositories are deduplicated by account and repository ID.

**Refresh selected** updates the metadata and READMEs of selected saved repositories. It does not call Jev. Unchanged classification inputs keep their existing results; changed inputs mark the results stale.

**Start** classifies the selected cached repositories against **all saved categories**:

- **Batch size** is the maximum number of repositories in one Jev request, not the number of concurrent requests. Requests run sequentially.
- The actual batch can be smaller to fit the model's input limits.
- If a single README is too large for inference, the request uses an explicitly marked excerpt. The full README stays in SQLite, and the current result is labeled **Excerpt**.
- Results appear in a table: one repository per row, one category per column, with a HeroUI probability bar and percentage in each cell.
- The compact table uses native HeroUI row styling and horizontal scrolling. Percentages show up to one decimal place; hover or focus a repository description for its metadata and timestamps.
- Missing, stale, or failed results are not displayed as `0%`.
- Search and table pagination operate on the local cache. Selection is retained across local pages; successful Load results are selected automatically.

Loading, refreshing, and classification run as background jobs. Only one job runs at a time. You can leave the workspace and return while a job is running. Finished repository results are persisted even if a later item fails; a server restart marks unfinished jobs failed rather than pretending they completed.

### Categories

Categories need only a `name` and a `description`. Explain what belongs in a category, and include exclusions when the boundary matters.

Manage individual categories directly in the saved list:

- **New category** opens a name-and-description form.
- **Edit** updates one category without replacing its ID or other categories.
- **Delete** removes one category after explicit confirmation; Cancel leaves it unchanged.

Names must be unique regardless of letter case. Successful additions, edits, and deletions invalidate previous classification previews; saving an unchanged category does not. All category mutations are blocked while a background job is running. Manual changes preserve any unsaved JSON draft and clear its replacement confirmation.

For bulk replacement, paste a JSON array into the editor:

```json
[
  {
    "name": "AI",
    "description": "Frameworks, models, and tools primarily used to build or run AI systems. Exclude general-purpose libraries that only mention AI as an example."
  },
  {
    "name": "Developer Tools",
    "description": "Tools for building, testing, debugging, and maintaining software."
  },
  {
    "name": "Databases",
    "description": "Database engines, storage systems, and tools whose primary purpose is managing persistent data."
  }
]
```

Import **replaces the entire local category collection**, never merges it. Names must be unique, and names and descriptions must be nonempty. Replacement requires confirmation; `[]` explicitly clears the collection. Invalid input leaves saved categories unchanged. Replacement makes previous classification previews stale.

Categories are local definitions, not GitHub list mutations. Every classification uses the complete collection; there is no per-run category selection.

### Settings

Save a **GitHub token** and a **Jev API token**. Either token can be replaced independently; a blank field leaves the saved token unchanged. Saving reports that a token is configured, not that its upstream permissions have been validated.

The GitHub token must be able to read your starred repositories and their contents, including any private repositories you want to load. Repository permissions, organization SSO policies, and API rate limits still apply. The Jev token comes from your TypeSafe account.

Tokens are used by the server, never returned by settings endpoints or stored in browser storage. Changing the GitHub token reconnects the account; repository caches are scoped by GitHub account ID.

## Jev integration

The application uses the official [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript) and currently pins `jev-1.13.0`.

Each request contains repository evidence and category definitions as structured state. A separate [Noul question](https://docs.typesafe.ai/primitives/noul) evaluates each repository/category pair, explicitly identifying the relevant inputs. This returns the probability that the repository belongs to that category, not a share of an exclusive classification and not a task-completion percentage.

The server validates answer coverage and probability bounds before saving results. Saved results are tied to their repository content hash and category revision, so outdated responses cannot overwrite current data. Typed output does not guarantee that the model's judgment is correct; these results remain previews for review.

## Local development

Requirements:

- **Node.js 24 or newer**, for the built-in `node:sqlite` runtime.
- **pnpm 10.33.0**, as specified in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), save your tokens in **Settings**, define **Categories**, then use **Workspace**. No credentials are required just to open the application or edit categories; actual GitHub/Jev operations require their respective tokens.

| Command          | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `pnpm dev`       | Start the local Vite development server on port 3000.                  |
| `pnpm typecheck` | Check TypeScript without emitting files.                               |
| `pnpm build`     | Build the application for the Node.js server runtime.                  |
| `pnpm start`     | Run `.output/server/index.mjs` on the loopback interface; build first. |

`GET /api/health` returns `{ "status": "ok" }`.

## Storage and security

Data is created lazily in the ignored `.data/` directory:

- `stars.sqlite` and SQLite sidecar files: repository metadata, full READMEs, categories, pagination state, classification results, jobs, and encrypted tokens.
- `token.key`: the local encryption key for AES-256-GCM token storage.

The data directory is owner-only, and the database and key files have restricted permissions. **Back up the database and key together.** The key lives on the same machine, so encryption is not protection against an attacker who can read the entire data directory or control your account.

To use another data directory:

```sh
APP_DATA_DIR=/absolute/path/to/star-data pnpm dev
```

This is **not a public multi-user service**. Development and production commands bind to the loopback interface, and the API rejects foreign origins. There is no application login system; do not expose the server to the internet or an untrusted network.

## Tech stack and project map

TypeScript, React, TanStack Start, Hono, HeroUI v3, Tailwind CSS v4, Vite, Nitro, Node.js SQLite, and the TypeSafe SDK.

All UI controls use HeroUI components. `src/styles.css` imports Tailwind and HeroUI, then sets the approved global radius tokens: `--radius: 0.125rem` and `--field-radius: 0.25rem`. At the default root font size, buttons, cards, and dialogs have 6px corners; inputs and textareas have 4px corners. Colors, shadows, and other component styling remain at HeroUI defaults. Tailwind utilities handle layout, spacing, responsive behavior, and semantic typography; there are no per-component visual overrides.

| Path                                                                                   | Purpose                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/routes/index.tsx`, `src/components/workspace/`                                    | Workspace controls, cached repository table, probability bars, selection, and job polling.        |
| `src/routes/settings.tsx`                                                              | Server-side token configuration.                                                                  |
| `src/routes/categories.tsx`                                                            | Manual category creation, editing, deletion, and confirmed JSON replacement.                      |
| `src/routes/__root.tsx`, `src/components/app-shell.tsx`, `src/components/app-link.tsx` | Root document and HeroUI navigation.                                                              |
| `src/lib/contracts.ts`, `src/lib/api.ts`                                               | Shared API types and browser request helper.                                                      |
| `src/server.ts`, `src/server/api.ts`                                                   | TanStack/Hono integration, local API boundary, settings, categories, cache reads, and job status. |
| `src/server/store.ts`, `src/server/jobs.ts`                                            | SQLite persistence, token encryption, and background job lifecycle.                               |
| `src/server/github.ts`, `src/server/github-routes.ts`                                  | GitHub count, paginated loading, README retrieval, and refresh.                                   |
| `src/server/classification.ts`, `src/server/classification-routes.ts`                  | Jev request packing, independent judgments, and result persistence.                               |
| `src/router.tsx`, `src/routeTree.gen.ts`                                               | Router setup and generated route tree.                                                            |
| `scripts/`                                                                             | Earlier standalone GitHub Star List experiments; not part of the application.                     |
| `.agents/skills/`                                                                      | Project-local guidance, including TypeSafe and HeroUI.                                            |

### Earlier experiments

The `scripts/` directory and its [API notes](scripts/GITHUB_STAR_LIST_API.md) are unchanged. Some experiments can create GitHub lists or replace list memberships. Review them before running them: the web application's preview-only scope does not make those scripts read-only.
