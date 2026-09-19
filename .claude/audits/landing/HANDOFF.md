# Handoff prompt: Expressive Captions landing page

Paste this into a fresh Claude Code session in `/home/shubh/Documents/FirstCommit`.

---

You're taking over the landing page of Expressive Captions (Vite + React 19 + TS + Tailwind v4,
`apps/web`). Read, in order: root `CLAUDE.md` (ownership and the binding audit rule), then
`.claude/audits/landing/phase-01` → `phase-04`. Those audits are the source of truth. This prompt
is the map.

## Where the code is
- **Branch `landing-redesign`** (from `origin/master`) holds all of it. It's pushed, not merged, with
  no PR yet. Work there. Check `git status` and `git log -3` first; don't trust this file over git.
- Remote is `origin`. Never force-push, and never commit to `master` directly.

## What the page is now
- `pages/LandingPage.tsx`:
  - **Hero:** two columns, with the copy on the left. The title is two locked lines, "Create,
    Caption, and Edit" / "All With Your Voice", in General Sans 700 with a masked word-rise. The
    sphere sits on the right.
  - **Scroll:** `--hero-p` drives the heading split (line 1 slides left, line 2 right).
  - **Sections below the hero:** Showcase → Tone ("Same reel. Three moods.") → Signals ("Not an
    LLM wrapper.") → Talk to edit → Hinglish marquee → Steps → Closing → footer.
- `components/VoiceSphere.tsx` (WebGL particle sphere):
  - **Load intro:** it forms small, centred and part-orange; 60% of the particles fade to grey
    (40% stay white); it glides home.
  - **Overlapping timeline** (the `INTRO_*` constants, with a diagram in the comment above them):
    arms grow out of the sphere and then the pills appear (SENTIMENT ANALYSIS, VOICE AI NATIVE,
    EASIER TO EDIT, TRENDY, in fixed slots).
  - **Scroll reaction:** spin and tilt with scroll direction, ripple with scroll speed.
  - **Mic:** an orange mic CTA.
- `landing/LandingNavbar.tsx`: fixed, transparent until scrolled, with a slide-in, orange progress
  hairline and a shine CTA; the dropdowns are unchanged.
- `landing/LandingScrollbar.tsx`: a custom overlay scrollbar. The native one is hidden on this page
  via the `landing-native-scrollbar-hidden` class on `<html>`.
- `landing/caption-demo.tsx`: the shared kit: `CaptionWords` (captions drawn by the editor's own
  `lib/caption-style.ts`), `useLoopClock`, `useScrollVar`, `SectionHeading`.
- `landing/LANDING_COPY.md`: a copy bank with a status tag on every claim (ok / check / no).

## Rules the owner set (keep them)
- **Honest content only.** No invented stats, testimonials, logos, pricing or speed claims. Numbers
  are computed from code, quotes come from `packages/shared/fixtures`. See LANDING_COPY.md
  "Do not say".
- **Background** (`LandingBackground.tsx`): grid + dots, keep as is. The cosmic/nebula look was
  rejected.
- **Motion style:** motion-design overlap (each stage starts before the last ends), slow expo eases,
  masked text rises. Respect `prefers-reduced-motion` (everything static, intro skipped).
- **Intro:** plays every load; scrolling is LOCKED until it finishes (owner's call).
- **Artifact phone preview** (https://claude.ai/artifact/S2m5fQSsAjvLKKc3aggEHR): do NOT update it
  unless the owner asks.
- **Don't edit** the six original `landing/*Section.tsx` files (other branches render them), and
  don't touch other owners' folders (`services/`, `remotion/`, `packages/shared`).
- Every implementation phase needs an audit doc in `.claude/audits/landing/`.

## Open items
1. The pill clicks still fire the old effects (shake/stretch/glow/scale-up), which don't match the
   new labels. Ask the owner what each should do.
2. "saaaal" renders as "saaaalll" because the fixture has repeats baked in. That's P1's data issue.
3. The showcase frames need rights-cleared footage (currently gradient backdrops).
4. Nobody has watched the intro, glide, arms or scroll reaction in a real rendering tab, or on a phone.
5. Optional cleanup PR: the unused `dark/*` sections, `SphereCornerCaptions`, and the old
   `word-reveal` / `subtitle-reveal` / `eyebrow-reveal` keyframes.

## How to run and check
- Web: `cd apps/web && npm run dev` (an earlier session ran it on :5174). API: Docker compose
  (`firstcommit-api-1` on :8010).
- Checks: `npx tsc -b`, `npx oxlint src`, `npm run build`, `npm run check:captions`.
- **Gotcha:** the Claude-in-Chrome automation tab reports `visibilityState: hidden` and 0 rAF/s, so
  WebGL, CSS-transition progress and native smooth scroll don't advance there. Verify timing via
  DOM state, and have the owner watch the motion.
- **Artifact build recipe** (only if asked): a landing-only single-file bundle. The entry imports
  `pages/LandingPage` + `RouterProvider` by absolute path from a scratch dir. Build via the Vite
  API with `rolldownOptions.input` pointing at that entry. Inline the CSS and the ASCII-escaped
  JS into one HTML, and embed General Sans as base64 `@font-face` (fontshare is blocked by the
  Artifact CSP). A multi-file or code-split publish renders blank in the Artifact frame. The full
  app with `codeSplitting: false` breaks on a module-init order bug.
