# Agent Instructions

## Language

- Communicate with the user in Chinese.
- Write code, identifiers, comments, documentation, configuration text, and application UI text in English.
- Write commit descriptions in English.

## Git Commits

- Use Gitmoji for every commit message: `<emoji> <English description>`.
- Choose the Gitmoji that matches the change. Example: `⚗️ Add GitHub star list experiments`.

## Maintenance

- Update `AGENTS.md` with every project change. Keep the Project Map current when features, entry points, configuration, or skills are added, changed, moved, or removed so agents can find the relevant implementation.

## Skills

- Use `.agents/skills/typesafe-ai/SKILL.md` when designing or implementing this project's TypeSafe/Jev-powered AI features. Read the relevant live TypeSafe documentation before writing or changing integrations.

## Project

- Project name: `github-categorizing-jev`.
- Package manager: `pnpm`.
- Stack: TypeScript, React, TanStack Start, Hono, and HeroUI.
- The `scripts/` directory contains earlier experiments. Leave its contents unchanged unless the user explicitly asks to modify them.

### Project Map

| Feature / Concern | Location |
| --- | --- |
| Home page and API connectivity check | `src/routes/index.tsx` |
| Root document and shared styles | `src/routes/__root.tsx`, `src/styles.css` |
| TanStack Router setup | `src/router.tsx`; `src/routeTree.gen.ts` is generated |
| Server entry and Hono integration | `src/server.ts` |
| Hono API routes, including `GET /api/health` | `src/server/api.ts` |
| Build, dependencies, and TypeScript configuration | `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json` |
| GitHub Star List experiments | `scripts/` |
| Project-local agent skills and source records | `.agents/skills/`, `skills-lock.json` |
