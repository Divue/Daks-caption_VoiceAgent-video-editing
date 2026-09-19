# Landing: sphere load intro and white/grey particle mix (phase 03)

## Status
Implemented; typecheck and lint are clean. The sequence was checked in Chrome via DOM state, but
the animation was not watched (the automation tab paints no frames). Not committed.

## Objective (owner, 2026-09-19)
On every load: only the background and the sphere show; the sphere plays its entrance ("xyz")
big, centred and white, while a random 60% of the particles turn grey (owner chose 40% white /
60% grey); then it glides to its place in the hero, and after a short delay everything else loads.
Scrolling is locked until the intro ends. Length is the builder's call, above 2.5 s.

## Implementation
- `VoiceSphere.tsx` (edited at the owner's request):
  - **Colour.** New `uGreyMix` uniform and `vGrey` varying. Particles with `aTint < 0.6` fade to
    `COLOR_NEUTRAL` (now a cool grey, 0.6/0.6/0.64), each starting at a moment set by its own
    random tint. Whites are brighter (alpha ×1.45) and the accent dots stay white.
  - **Intro.** An `intro` prop and an `onIntroDone` callback. A layout effect parks the stage with
    a transform so the sphere sits centred in the viewport at up to
    min(78vw, 60vh, 560px), re-measured every frame until the glide. The canvas backing store is
    scaled by the same factor so the sphere stays sharp. The glide starts at 2250 ms and lasts
    950 ms; `onIntroDone` fires 150 ms after it lands (about 3.35 s in total).
  - **Gating.** Controls and connectors mount only once the sphere has landed, and the mic block
    and mobile control row stay in the layout but invisible and remount then, so their entrance
    animations play after the glide. Grey mix: 500–2200 ms.
  - Without the intro (reduced motion, or no prop), the sphere starts in its final mix.
- `LandingPage.tsx`:
  - Resets and locks scroll during the first render (before the sphere measures).
  - The navbar and scroll cue mount after the intro. The hero copy holds its space while
    invisible and remounts afterwards; the glow fades in.
  - The lock is also cleared on unmount.

## Testing
- `npx tsc -b`: clean. `npx oxlint` on both files: clean.
- Chrome, desktop: mid-intro the page is locked and the navbar hidden, the copy is invisible, the
  stage is scaled about 2.5× and the canvas renders at 2.5× resolution. At the end the navbar is
  in, the lock is off, the stage transform is gone and the pills are mounted. No console errors.
- Horizontal centring was exact after moving the lock before the measurement. The 36 px vertical
  drift (a reflow after measuring) is addressed by the per-frame re-park, which could NOT be
  observed in the automation tab (no rAF there).

## Unverified
- Watching the animation itself (formation, grey fade, glide), on desktop and on a phone.
- The vertical centring after the per-frame fix.

## Scope
`apps/web` only: `VoiceSphere.tsx`, `LandingPage.tsx`. The phone preview Artifact was republished
from a scratch build.

## Revision 2 (owner feedback, same day)
- **Intro size:** the intro sphere was halved (target `min(39vw, 30vh, 280px)`).
- **Orange start:** the swarm starts partly orange (`uWarm`, per-particle amount) and drains to
  the white/grey mix between 350 and 1850 ms.
- **Arms, then pills:** after landing, the connector "arms" grow out of the sphere
  (`connectorGeometry(…, grow)`, 700 ms each, staggered 130 ms). Each pill enters as its arm
  arrives (`armArrivesAt`). The hero glow fades in over 2.4 s (an outer fade layer and an inner
  breathing layer, since the breathe animation would override the fade).
- **Text:** the headline words use a masked, motion-graphics style rise (`mask-up`: 115% → 0 with
  a 6° tip, 1.25 s, 75 ms stagger). The eyebrow, subtitle, CTAs and bullets use a slow blur-rise
  (`rise`, 1.2 s). The navbar entrance is now 1.1 s with a 0.15 s delay.
- **Pills renamed:** SENTIMENT ANALYSIS, VOICE AI NATIVE, EASIER TO EDIT, TRENDY, with lucide icons
  (AudioWaveform, Mic, Wand2, Sparkles). Clicking still triggers the old sphere effects. The slots
  are FIXED (the shuffle was removed) so the long labels sit where they fit. Measured in iframes:
  no overlap with the headline at 1280 (48 px clear) or 1024 (20 px clear). "Voice AI native"
  overran 1024 px by 4 px, so its slot moved from −28° to −40°. That move was re-checked by
  arithmetic only (about 14 px inward), not by measurement, because the browser extension
  disconnected.
- **Mic:** a 64 px signal-orange radial button with a breathing halo and a slow pulse ring,
  blue-violet while listening. Status text brightened.
- **Checks:** tsc and oxlint clean; build OK; phone preview republished (v5). The animation itself
  has still not been watched in a rendering tab.

## Revision 3: overlapping timeline and custom scrollbar
- **Overlapping timeline** (motion-design overlap; each stage starts before the last ends):
  - the glide starts at 1850 ms (the xyz entrance ends at 2400 ms);
  - page content (navbar, copy, glow) and the scroll unlock at mid-glide (about 2280 ms);
  - arms and controls at 75% of the glide (about 2560 ms), riding the rest of it inside the stage;
  - the canvas returns to normal resolution only when the glide ends (2800 ms);
  - arm delay cut from 200 to 60 ms.
- **Custom scrollbar:** the native scrollbar is hidden while the landing page is mounted (the
  `landing-native-scrollbar-hidden` class on `<html>`, removed on unmount, so the editor is
  unaffected). `landing/LandingScrollbar.tsx` draws an overlay thumb: it fades in with the content,
  sits dim when idle, brightens while scrolling, turns signal-orange on hover or drag, can be
  dragged or its track clicked to jump, and is fine pointers only (touch devices keep their own
  overlay bars). The overlay takes no width, so the lock lifting shifts nothing.
- **Verified in Chrome:** glide at 1872 ms, content and unlock at 2365 ms (throttled background
  tab); `clientWidth === innerWidth` (native bar takes no space); track visible after the intro;
  no console errors. tsc, oxlint and build clean.
- **Not verified:** drag feel, and the animation itself in a rendering tab.
- **Phone preview:** the Artifact was intentionally NOT republished (owner asked to stop updating it).
