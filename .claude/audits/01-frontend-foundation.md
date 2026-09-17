# Frontend Foundation

## Status
Completed

## Commit
`259ab2a` — "Scaffold apps/web with Vite + React + TS + Tailwind v4 + shadcn/ui"

## Objective
Stand up the P3 editor project per `apps/web/README.md` so subsequent
editor-feature commits have a working build.

## What was implemented
- Vite scaffold via `npm create vite` (react-ts template).
- Tailwind v4 via `@tailwindcss/vite` (no separate PostCSS config needed).
- shadcn/ui initialized (new-york style, CSS variables) — `components.json`
  added.
- `@captions/shared` added as a workspace dependency.
- `@/*` path alias configured in `tsconfig.json`/`tsconfig.app.json` (no
  `baseUrl`, since it is deprecated under `moduleResolution: bundler` in the
  TS version used).

## Files created
`apps/web/.gitignore`, `apps/web/.oxlintrc.json`, `apps/web/components.json`,
`apps/web/index.html`, `apps/web/package.json`, `apps/web/public/favicon.svg`,
`apps/web/public/icons.svg`, `apps/web/src/App.css`, `apps/web/src/App.tsx`,
`apps/web/src/assets/hero.png`, `apps/web/src/assets/react.svg`,
`apps/web/src/assets/vite.svg`, `apps/web/src/index.css`,
`apps/web/src/lib/utils.ts`, `apps/web/src/main.tsx`,
`apps/web/tsconfig.app.json`, `apps/web/tsconfig.json`,
`apps/web/tsconfig.node.json`, `apps/web/vite.config.ts`.
Root `package-lock.json` created (workspace install artifact).

## Files modified
`apps/web/README.md` (minor addition).

Note: `App.css`, `src/assets/*`, `public/icons.svg` created here were later
deleted in the editor-shell commit (`46c452f`) as scaffold boilerplate was
replaced with real layout.

## Why we chose this approach
Matches the stack decision in root `CLAUDE.md` (Vite + React + TypeScript +
Tailwind + shadcn/ui, Amplify-hosted). Using the shared package as a workspace
dependency (rather than copying types) keeps `apps/web` on the single source
of truth for the `Project` schema, per root `CLAUDE.md`'s instruction to read
`packages/shared/src/project.ts` before touching project data.

## Alternatives considered
No alternative was formally documented, except one recorded workaround: the
commit message notes shadcn CLI 4.x's `init`/`add` crashed with "Could not
load the workspace config" in this environment (even outside a monorepo), so
the `shadcn` devDependency was pinned to `3.8.5`, which works.

## Important constraints
Scaffold only — no editor functionality, no state management, no schema
integration beyond installing the dependency.

## Integration boundary
Establishes the workspace link to `packages/shared` that every later
milestone (state management, inspector, presets) depends on for types and
runtime validation (`Project`, `PRESETS`).

## Decisions future developers must preserve
- Keep `shadcn` devDependency pinned unless the workspace-config crash is
  independently confirmed fixed upstream.
- Keep the `@/*` alias without `baseUrl` (matches this TS version's
  `moduleResolution: bundler`).
- Do not vendor or duplicate `packages/shared` types — always import from
  `@captions/shared`.

## Verification
Commit message states: `npm run build` and `npm run dev` both succeeded with
no warnings; `@captions/shared`'s `Project.safeParse()` was manually verified
against `packages/shared/fixtures/demo-project.json` (16 words, 1 overlay)
via a throwaway `tsx` script that was removed afterward. No automated test
exists for this in the repository.

## Known limitations / deferred work
No editor UI yet — this commit only produces the default Vite/React starter
page (later replaced).

## Future integration
All subsequent `apps/web` milestones build on this scaffold.
