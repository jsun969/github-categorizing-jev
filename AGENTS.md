# Agent Instructions

## Language

- Communicate with the user in Chinese.
- Write code, identifiers, comments, documentation, configuration text, and application UI text in English.
- Write commit descriptions in English.

## Git Commits

- Use Gitmoji for every commit message: `<emoji> <English description>`.
- Choose the Gitmoji that matches the change. Example: `⚗️ Add GitHub star list experiments`.
- Commit completed, coherent changes proactively without waiting for an explicit user request; use your judgment to make multiple commits for one prompt or no commit when there is no commit-worthy change.

## Maintenance

- Update `AGENTS.md` with every project change. Keep the Project Map current when features, entry points, configuration, or skills are added, changed, moved, or removed so agents can find the relevant implementation.

## Skills

- Use `.agents/skills/typesafe-ai/SKILL.md` when designing or implementing this project's TypeSafe/Jev-powered AI features. Read the relevant live TypeSafe documentation before writing or changing integrations.
- Use `.agents/skills/heroui-react/SKILL.md` and current HeroUI v3 documentation before implementing UI components.

## Project

- Project name: `github-categorizing-jev`.
- Package manager: `pnpm`.
- Stack: TypeScript, React, TanStack Start, Hono, and HeroUI.
- UI must use HeroUI v3 components and their default theme. Do not add custom CSS or override component visuals; use Tailwind utilities only for layout, spacing, responsiveness, and semantic typography.
- Purpose: use TypeSafe's Jev to classify GitHub starred repositories into user-defined Star Lists, allowing multiple lists per repository.
- Current scope: a local single-user classification preview with SQLite persistence and no writes to GitHub Star Lists. Node.js 24 or newer is required for the built-in SQLite runtime.
- The `scripts/` directory contains earlier experiments. Leave its contents unchanged unless the user explicitly asks to modify them.

### Project Map

| Feature / Concern                                                       | Location                                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Project purpose, preview-only scope, and local setup                    | `README.md`                                                                                               |
| Workspace controls, repository matrix, selection, and job polling       | `src/routes/index.tsx`, `src/components/workspace/`                                                       |
| Token settings and confirmed category JSON replacement                  | `src/routes/settings.tsx`, `src/routes/categories.tsx`                                                    |
| Root document and shared styles                                         | `src/routes/__root.tsx`, `src/styles.css`                                                                 |
| HeroUI navigation and shared API contracts                              | `src/components/app-shell.tsx`, `src/components/app-link.tsx`, `src/lib/contracts.ts`, `src/lib/api.ts`   |
| TanStack Router setup                                                   | `src/router.tsx`; `src/routeTree.gen.ts` is generated                                                     |
| Server entry and Hono integration                                       | `src/server.ts`                                                                                           |
| Hono API routes, including `GET /api/health`                            | `src/server/api.ts`                                                                                       |
| SQLite persistence, encrypted tokens, and job lifecycle                 | `src/server/store.ts`, `src/server/jobs.ts`, `src/server/errors.ts`; local data lives in ignored `.data/` |
| GitHub count, paginated loading, README retrieval, and refresh          | `src/server/github.ts`, `src/server/github-routes.ts`                                                     |
| Jev request budgeting, independent category probabilities, and batching | `src/server/classification.ts`, `src/server/classification-routes.ts`                                     |
| Build, dependencies, and TypeScript configuration                       | `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`                                       |
| Official TypeSafe/Jev SDK dependency                                    | `@typesafe-ai/sdk` in `package.json`, pinned in `pnpm-lock.yaml`                                          |
| GitHub Star List experiments                                            | `scripts/`                                                                                                |
| Project-local agent skills and source records                           | `.agents/skills/`, `skills-lock.json`                                                                     |
