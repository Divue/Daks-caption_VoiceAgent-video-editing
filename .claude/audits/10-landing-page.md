# Landing Page + Routing

## Status
Completed

## Commit
`628a3e6` — "feat: redesign editor and add landing page". **Shared with
`09-editor-ui-redesign.md`** — see that document for the same commit's
editor-facing changes.

## Objective
Add a marketing landing page and a minimal router so the app has a public
entry point (`/`) separate from the editor (`/editor`), without mounting
editor/project state on the landing page.

## What was implemented
- `router.tsx`: hand-rolled `RouterProvider`/`useRoute` supporting exactly
  `/` and `/editor`, backed by `window.history.pushState` +
  `popstate`. Comment: *"only two destinations exist, so no library is
  needed."*
- `AppRoot.tsx`: reads the current route; renders `LandingPage` for `/`, or
  `ProjectProvider > App` for `/editor` (lazy-loaded via `React.lazy` +
  `Suspense`). `ProjectProvider` — and therefore all project state — only
  mounts on `/editor`.
- `pages/LandingPage.tsx`: composes 8 stateless sections — `LandingNavbar`,
  `HeroSection`, `ValuePropsSection`, `HowItWorksSection`,
  `AiEditingSection`, `CaptionStylesSection`, `CreatorSection`,
  `FinalCtaSection`, `LandingFooter`. Comment: *"Stateless marketing page —
  no ProjectProvider, no editor state."*
- `AnimatedSection` + `useInView` (new hook): `IntersectionObserver`-based
  scroll-in animation wrapper used by landing sections.
- `main.tsx` updated to render `RouterProvider > AppRoot` (was previously a
  direct `App` render).

## Files created
`apps/web/src/AppRoot.tsx`, `apps/web/src/router.tsx`,
`apps/web/src/pages/LandingPage.tsx`,
`apps/web/src/hooks/useInView.ts`,
`apps/web/src/components/landing/AiEditingSection.tsx`,
`apps/web/src/components/landing/AnimatedSection.tsx`,
`apps/web/src/components/landing/CaptionStylesSection.tsx`,
`apps/web/src/components/landing/CreatorSection.tsx`,
`apps/web/src/components/landing/EditorPreviewMock.tsx`,
`apps/web/src/components/landing/FinalCtaSection.tsx`,
`apps/web/src/components/landing/HeroSection.tsx`,
`apps/web/src/components/landing/HowItWorksSection.tsx`,
`apps/web/src/components/landing/LandingFooter.tsx`,
`apps/web/src/components/landing/LandingNavbar.tsx`,
`apps/web/src/components/landing/ValuePropsSection.tsx`.

## Files modified
`apps/web/src/main.tsx` (see `09-editor-ui-redesign.md` for the same file's
other changes in this commit). `apps/web/index.html`'s title/font changes
(documented in `09-editor-ui-redesign.md`) apply globally, including to this
page.

## Why we chose this approach
Root `CLAUDE.md` scopes this as a hackathon MVP without auth or general
routing needs — only two real destinations exist (marketing page, editor),
so a full routing library would be unused surface area. Keeping
`ProjectProvider` out of the landing page's render tree means the landing
page never triggers fixture parsing or reducer setup, and avoids exposing
editor state where it isn't needed.

## Alternatives considered
No alternative was formally documented. (The router's code comment does
record the reasoning for not using a library: exactly two destinations.)

## Important constraints
- Router supports exactly two routes; adding a third route requires
  extending `resolveRoute`/`Route` in `router.tsx`, not just adding a new
  page component.
- Landing page has no data fetching and no project state — it must stay
  presentational.

## Integration boundary
`AppRoot.tsx` is the seam between marketing and product. `LandingNavbar`,
`HeroSection`, and `FinalCtaSection` all call `useRoute()`'s `navigate(...)`
(verified via source) to enter `/editor` from their CTAs.

## Decisions future developers must preserve
- Do not add a routing library for two routes; extend the existing
  `router.tsx` if more routes are needed, or revisit the decision explicitly
  if the route count grows meaningfully.
- Keep `ProjectProvider` scoped to `/editor` only.
- Keep landing sections stateless/presentational.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
No 404/not-found route (any unrecognized path falls back to `/`, per
`resolveRoute`). No transition/loading UI beyond the `Suspense fallback={null}`
for the lazy-loaded pages.

## Future integration
If the app grows more pages (settings, project list, auth), the router here
would need to be extended or replaced — root `CLAUDE.md` currently scopes
out auth and general video editing, so this is not expected imminently.
