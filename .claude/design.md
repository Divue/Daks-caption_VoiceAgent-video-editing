# Design System — Voice Video Editor
_Status: v0.2 — visual reference screenshot reviewed and calibrated into the sections below (marked [Ref]). Treat everything below as the current source of truth until superseded by an explicit revision._

## 1. Product Context

A web application for editing video using natural spoken language instead of manual timeline manipulation — "cut the last 5 seconds," "add a zoom on this clip," "make the intro punchier." The product replaces the traditional NLE (non-linear editor) interaction model with conversational/voice control layered over a real editing surface.

**Target feel:** fast, intelligent, creative, professional. Premium product-website quality — not a template, not "AI-generated-looking."

**Brand tension to design for:** this product sits between two poles that most AI tools collapse into one —
- **Precision** (it's still a professional editing tool — timelines, clips, frames, output quality matter)
- **Expressiveness** (voice and creativity are the whole pitch — it should feel alive, responsive, human)

The design system should let both registers coexist: a controlled, technical grid/type system for structure, and a warmer, more organic accent/motion layer for the voice/AI moments.

## 2. Design Principles

1. **Confident restraint.** Premium reads as "one strong idea, said quietly" — not five gradients and three glows per section. Most of the UI is quiet neutral surface; color is spent deliberately on the few things that matter (primary CTA, active voice state, key data).
2. **Voice is visible, not decorative.** The one truly novel part of this product is spoken command → edit. The system needs a first-class visual language for "listening," "processing," and "understood" states — not a generic AI sparkle icon.
3. **Depth through light, not through clutter.** Hierarchy comes from elevation, blur, and glow atmosphere — soft radial light sources, subtle borders, layered translucency — rather than heavy drop shadows or boxes-within-boxes.
4. **Technical credibility.** Typography, spacing, and grid must read as engineered — tight, aligned, intentional — so the product is trusted as a real editing tool, not a marketing toy.
5. **Motion earns its keep.** Micro-interactions communicate state changes (listening → thinking → done, clip added, command understood) rather than being decorative flourish.

## 3. Color System

Dark-first design (premium editing/creative tools — Descript, Runway, Resolve, Linear — all converge here; dark also makes video thumbnails and waveforms pop). A light theme is out of scope for v1 unless requested later.

Avoiding the default "AI purple/blue gradient" cliché. Instead: a near-black neutral base with **two accents that map to the brand tension** — a warm signal color for voice/human/creative moments, and a cool precision color for system/technical/data moments. They rarely appear together in the same element.

### 3.1 Neutrals (base UI)
| Token | Hex | Use |
|---|---|---|
| `--bg-canvas` | `#0A0A0C` | Page/app background |
| `--bg-surface` | `#111114` | Panels, cards |
| `--bg-surface-raised` | `#18181C` | Elevated cards, modals, popovers |
| `--bg-overlay` | `#1E1E23` | Hover states, input fields |
| `--border-subtle` | `#242429` | Default hairline borders |
| `--border-default` | `#33333A` | Emphasized borders, focus outlines (paired w/ accent) |
| `--text-primary` | `#F5F5F7` | Headlines, primary content |
| `--text-secondary` | `#A3A3AD` | Body copy, descriptions |
| `--text-tertiary` | `#6B6B75` | Captions, metadata, disabled |

### 3.2 Accents
| Token | Hex | Meaning / use |
|---|---|---|
| `--accent-signal` | `#FF6B4A` (warm coral-ember) | Voice/creative moments: active mic, waveform, primary CTA, "understood" confirmations |
| `--accent-signal-dim` | `#5C2A20` | Signal accent at rest / backgrounds tinted with signal |
| `--accent-precision` | `#4ADEDE` (cool cyan) | System/technical moments: processing states, timestamps, technical badges, secondary data viz |
| `--accent-precision-dim` | `#123B3B` | Precision accent backgrounds |
| `--accent-success` | `#5FD87A` | Export complete, success toasts |
| `--accent-warning` | `#F5B84A` | Warnings, destructive-adjacent confirmations |
| `--accent-danger` | `#F0503C` | Errors, destructive actions |

**Rule of thumb:** one accent hue per screen moment. Never blend signal-orange and precision-cyan in the same gradient — they represent different registers (human voice vs. machine precision) and mixing them muddies the metaphor. Gradients, when used, stay within a single hue family (e.g., signal → near-black), not multi-hue rainbow blends.

### 3.3 Atmosphere / glow tokens
Used for hero backgrounds and ambient depth, not for UI chrome.
- `--glow-signal`: radial gradient, `#FF6B4A` at ~18% opacity → transparent, large soft radius (600–900px), placed off-axis (not dead-center) behind hero content.
- `--glow-precision`: radial gradient, `#4ADEDE` at ~12% opacity → transparent, used sparingly as a secondary counter-glow in a far corner.
- Glows sit on `--bg-canvas`, blurred (`filter: blur(120px)+`), never crisp-edged. Max two glow sources per viewport.
- **[Ref] Placement over centering:** the primary hero glow should not just sit decoratively behind the headline — anchor it low in the hero (behind the CTA/social-proof area) so it bleeds downward into the top of the next section. This stitches sections together visually instead of each section reading as an isolated box. A faint graph/dot grid texture (very low opacity, ~4–6%, on `--bg-canvas`) can sit under the glow in the hero for added technical texture — grid reads "precision," glow reads "energy"; using both together is the intended pairing for the hero specifically, not every section.
- **[Ref] Section-transition device:** at major section boundaries (e.g., end of hero), use a full-width 1px hairline gradient (transparent → `border-default` → transparent) with a small soft glow node in `--accent-signal` at its horizontal center. This gives sections a deliberate seam instead of an abrupt cut.

## 4. Typography

**Pairing:** a distinctive grotesque display face for headlines + a neutral, highly legible UI face for everything functional. This split is what separates "premium product" from "template" — using one font everywhere (esp. default Inter-everywhere) reads generic.

- **Display:** `General Sans` (Fontshare, free, variable) — used for H1/H2 marketing headlines and large in-app moments only.
- **UI / body:** `Inter` — used for all body copy, UI labels, buttons, forms, in-app editor chrome.
- **Monospace (technical accents):** `JetBrains Mono` — timestamps, frame counters, command transcripts ("hear what the user said"), keyboard shortcuts.

Using mono for the transcribed-voice-command display is a signature detail: it visually signals "this text came from a technical process (transcription)," distinct from human-written UI copy.

### 4.1 Type scale (marketing/site context)
| Token | Size / Line-height | Weight | Use |
|---|---|---|---|
| `display-xl` | 72px / 1.05 | 600 | Hero headline |
| `display-lg` | 56px / 1.08 | 600 | Section headline |
| `display-md` | 40px / 1.12 | 600 | Sub-section headline |
| `heading-lg` | 28px / 1.25 | 600 | Card/feature titles |
| `heading-md` | 20px / 1.3 | 600 | Small headings |
| `body-lg` | 18px / 1.6 | 400 | Lede/intro paragraphs |
| `body-md` | 16px / 1.6 | 400 | Standard body |
| `body-sm` | 14px / 1.5 | 400 | Secondary text, captions |
| `label` | 13px / 1.2 | 500, uppercase, +0.04em tracking | Eyebrows, tags, section labels |
| `mono-sm` | 13px / 1.4 | 400 (mono) | Transcripts, timestamps, shortcuts |

Letter-spacing: display sizes get slightly negative tracking (-0.02em to -0.03em) for a tighter, engineered look; body text stays at 0.

## 5. Spacing & Layout

- **Base unit:** 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- **Content max-width:** 1200px for marketing sections; full-bleed for atmospheric hero backgrounds behind it.
- **Section vertical rhythm:** 96–160px padding between major marketing sections (generous whitespace is a premium signal — cramped sections read as template-y).
- **Grid:** 12-column, 24px gutter at desktop; collapses to 4-column, 16px gutter at mobile.
- **[Ref] Nav treatment:** the primary nav is a floating, inset pill/rounded-rect container (`--radius-lg`, `--bg-surface` at ~90% opacity, 1px `border-subtle`) with margin from the viewport edges on all sides — not an edge-to-edge bar. This is what separates a "product site" nav from a "template" nav; reads more like a floating control surface than a legacy website header.
- **Radius scale:** `--radius-sm: 8px` (buttons, badges), `--radius-md: 12px` (inputs, small cards), `--radius-lg: 20px` (panels, feature cards), `--radius-full` (pills, avatars, mic button).

## 6. Depth & Elevation

No heavy drop shadows. Depth comes from three tools, layered:
1. **Surface stepping** — each elevation level is a slightly lighter neutral (`bg-canvas` → `bg-surface` → `bg-surface-raised`), not a shadow.
2. **Hairline borders** — 1px `border-subtle`, often at ~50% opacity, to separate surfaces without heaviness.
3. **Soft ambient shadow** for genuinely floating elements only (modals, dropdowns, tooltips): `0 20px 60px -20px rgba(0,0,0,0.5)` — large, soft, low-opacity, never a tight hard shadow.

**Glass/blur** is used sparingly for floating chrome that sits over video content (e.g., a transport bar over a video preview): `background: rgba(17,17,20,0.7); backdrop-filter: blur(20px);` with a 1px `border-subtle` edge.

## 7. Signature Motifs (this product's own identity)

These are the elements that should make the product recognizable as itself, independent of any reference:

- **Waveform as a UI primitive**, not just a media control — used in the hero, in loading/processing states, and as a literal component (audio waveform under video clips in the timeline). Rendered as vertical bars, not a smooth SVG line — reads more "signal/technical."
- **Listening pulse** — when the mic is active, a soft radial pulse in `--accent-signal` breathing outward from the mic button (scale 1 → 1.4, opacity 0.4 → 0, ~1.6s loop). This is the product's single most important micro-interaction; it should appear consistently everywhere voice input is possible.
- **Command transcript chips** — when a voice command is captured, render the recognized text in `mono-sm` inside a small pill with a subtle `accent-precision-dim` background, then transition to a confirmation state in `accent-success` once executed. This is the visual proof the product "understood you."
- **Clip chips** — video segments represented as small rounded rectangles with a thumbnail + waveform sliver, used in both the real editor and in marketing screenshots of the product.
- **[Ref] Directional CTA affordance** — primary pill buttons (site-wide, both nav and hero) carry a small diagonal arrow (↗) trailing the label. Consistent, minimal, and signals "this takes you somewhere" without extra copy. Reserve it for buttons that navigate/launch (Sign in, Get started); action buttons inside the editor (Cut, Add zoom, Export) don't use it.
- **[Ref] "Show, don't tell" module** — the section directly below the hero should pair a compact control/explanation panel with a *live-looking* product surface (real video frame + waveform + an in-progress edit state), side by side, rather than a generic 3-column feature grid or logo wall. This is the first proof-of-product moment and should look like a captured in-app state, not an illustration.

## 8. Motion Principles

- **Durations:** micro-interactions 120–200ms, panel/modal transitions 240–320ms, ambient/looping effects (glow drift, listening pulse) 1.5–4s.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (“ease-out-expo”-ish) for anything entering/appearing; standard `ease-in-out` for looping ambient motion.
- **Principle:** motion should communicate a state transition (idle → listening → processing → done) at every step of the voice interaction — the user should never wonder "did it hear me?" Silence/stillness is only ever used for genuinely idle states.
- Avoid gratuitous scroll-jacking or parallax overuse; premium ≠ busy. One or two well-placed reveal-on-scroll moments per page, not on every element.

## 9. Iconography & Imagery

- **Icons:** thin-stroke (1.5px), geometric, single-weight icon set (e.g., Phosphor or Lucide as a base, restyled) — no filled/glyph icons except for small status dots.
- **Product imagery:** real (or realistic mock) editor screenshots/video frames, dark-chrome framed, never generic stock footage or illustrated "AI brain" graphics. If illustration is needed, keep it abstract/geometric (waveform-derived shapes), tying back to the waveform motif rather than generic blob/gradient-mesh AI art.

## 10. Accessibility

- All text on `--bg-canvas`/`--bg-surface` must meet WCAG AA contrast — `--text-secondary` (#A3A3AD) on `--bg-canvas` (#0A0A0C) ≈ 8.9:1, safe for body text.
- `--accent-signal` (#FF6B4A) on dark backgrounds is for accents/icons/large text, not small body text at low weight — verify contrast per use.
- Motion: respect `prefers-reduced-motion` — listening pulse and ambient glow drift should fall back to a static/faded state.

## 11. Open Items

- **Visual reference reviewed (v0.2).** Structural/polish patterns extracted: inset floating nav, low-anchored bleeding hero glow + faint grid texture, hairline section-transition device with glow node, directional-arrow CTA convention, and a "show don't tell" demo module directly below the hero. Our own color system (signal/precision duo), typography pairing, and voice-specific motifs (waveform, listening pulse, transcript chips) remain unchanged and are not derived from the reference.
- No logo/wordmark direction yet.
- Light theme: assumed out of scope; confirm.
- Component-level specs (button variants, nav, form fields, exact card anatomy) intentionally deferred to a later step, once this system is approved.
