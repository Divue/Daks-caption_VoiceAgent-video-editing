# Hyperframes Composition Brief: Expressive Captions

## Objective
Create a short launch-style brag video for Expressive Captions.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.5 seconds (as built, exact)

## Source Material
- Project root: `/home/shubh/Documents/FirstCommit`
- Primary files read:
  - `apps/web/src/index.css` (the `@theme` landing palette, lines 182-296; hero root `.landing-background-root` line 438)
  - `apps/web/src/pages/LandingPage.tsx`, `src/components/landing/{SignalsSection,TalkToEditSection,ClosingSection}.tsx` (shipped copy)
  - `apps/web/src/components/preview/CaptionRenderer.tsx` (emphasis scale, angry shake math)
  - `apps/web/src/lib/caption-style.ts` (`renderedText()` — the letter-repeat rule)
  - `packages/shared/src/presets.ts` (the 7 real presets and their exact colours)
  - `packages/shared/fixtures/demo-project.json` (the canonical shared fixture: the real words and signals)
  - `services/api/app/agent/tools/schemas.py` (the real agent tool argument shapes)
  - `apps/web/src/lib/demo-prompts.ts` (the real tested voice commands)
- Product name: **Expressive Captions**
- Tagline / strongest claim: "Captions that hear your tone." Differentiator, in the product's own
  words: **"Not an LLM wrapper. We measure your voice."**
- Key UI or visual moment to recreate: a 9:16 caption frame on a near-black field where one word is
  2.93x its neighbours, vermilion, and physically shaking.
- Copy that must appear verbatim:
  - `Hello bhai log`
  - `itna bekaar tha yaar`
  - `Not an LLM wrapper.` / `We measure your voice.`
  - `Loudness  +1.20σ` / `Pitch  +1.80σ` / `Held  +646ms`
  - `→ emphasis · excited · stretch ×2.60`
  - `put a fire emoji on the word bekaar`
  - `find_words   query "bekaar" · matchType contains`
  - `set_emoji   wordIds [w12] · emoji 🔥`
  - `validated · 1 word updated`
  - `You don't need to edit.` / `Just talk.`
  - `Detected · angry`
  - `7 presets · the tone layer rides on all of them`
  - `Stop typing captions.` / `Start saying them.`
  - `Expressive Captions`
  - `Hinglish · voice-first · built on AWS`

## Creative Direction
- Tone preset: default
- Creative direction: a creator-tool launch that lets the captions do the talking
- Interpretation: comfortable 3-4.5s scenes, mixed case, clean slides and crossfades, one idea per
  scene. Energy comes from the caption effects themselves — the slam, the shake, the stretch — not
  from cutting fast. Warm and direct, never corporate. Nothing on screen is invented; every word,
  colour and number is lifted from the codebase.
- Angle: Show the same Hinglish sentence twice. Once flat, the way every captioning app writes it.
  Once as Expressive Captions writes it, with the held syllable stretched and the loud words red and
  shaking. The difference is the entire pitch, so the video never explains the product in the
  abstract — it demonstrates it in the first two seconds and spends the rest earning the claim.
- Hook: a plain white caption `Hello bhai log` holds long enough to look ordinary, then re-renders
  with `Hello` and `bhai` slamming to Anton uppercase vermilion (both are `emphasis: true`) while
  `Hello`'s five extra `o`s type in one at a time. Mono label swaps from `every other captioning
  app` to `same audio`.
- Outro / punchline: "Stop typing captions. / Start saying them." then the wordmark over the sunset
  stripe.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - **Any claim not on the verbatim list above.** In particular: do NOT put a live URL, a deploy
    badge, an accuracy percentage, a user/creator count, a "trusted by" row, or any Remotion
    Lambda / transitions / music-editing capability on screen. Several of those exist in the repo
    as aspirational or inert UI and would be false on camera.

## Visual Identity
- Background: `#05060a` (landing hero root). Panel/card fill `#111114`, raised `#18181c`,
  hairlines `#242429`, borders `#33333a`.
- Text: `#f5f5f7` primary, `#a3a3ad` secondary, `#8c8c98` mono micro-labels (raised from the app's
  `#6b6b75`, which measures 3.66:1 on this canvas and fails the WCAG gate).
- Accent: `#ff6b4a` (`--color-signal`) — headline second lines, CTAs, playhead, emphasis underline.
- Secondary accent (voice/AI only): `#8B98F0` — mic-live state, the pitch line.
- Caption preset colours (use exactly):
  - Rangmanch: body `#FFF6E9` Instrument Serif italic; emphasis `#E2452A` Anton UPPERCASE at
    **2.93x**; angry `#FF5C3A`, shake amplitude 3
  - Chamak: body `#FFFFFF` Inter 800; emphasis 7-stop symmetric gold gradient
    `#FFAE1A → #FFC44D → #FFE7A8 → #FFC44D → #FFAE1A` with a 100px `#FFAE1A` glow; angry `#FF6B3D`, shake 4
  - Dhamaka: lowercase Montserrat 800, tracking `-4.76px`, whole-preset 108px `#5E1130` glow;
    emphasis `#FF4D8D`; angry `#FF2E6B`, shake 5
  - Angry layer face: Montserrat 900 — Instrument Serif ships 400 only, so weight 900 on it would
    synthesise a fake bold rather than the real cut the emotion layer specifies.
- Sunset stripe (outro only): `linear-gradient(90deg, #fa520f 0%, #ff8105 34%, #ffb83e 62%, #ffd900 82%, #fff8e0 100%)`
- Display font: **General Sans** 600/700 (Fontshare). Fallback if unavailable: Inter 700 with
  `letter-spacing: -0.03em` — do not substitute a serif.
- Body font: Inter. **All numerics, tool names, chips and micro-labels: JetBrains Mono.**
- Caption faces (Google Fonts, all in the project's real `CAPTION_FONTS`): Anton, Instrument Serif
  (italic), Montserrat 800, Inter 800.
- Visual references from the project:
  - Landing hero atmosphere: `#05060a` base + two superimposed grids (220px major at 10% white
    alpha, 44px minor at 6%) under a `radial-gradient(70% 65% at 50% 42%, transparent 26%, black 60%)`
    mask, plus a soft coral vignette. Use this as the standing background for scenes 1, 2, 3, 5, 6.
  - Mono micro-labels are 11px / 600 / 1px tracking / uppercase (`.eyebrow`).
  - The editor's caption well: `oklch(0.125 0.004 62)`, `rounded-xl`, `ring-1 ring-white/8`.

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The same line, twice — 3.5s — `Hello bhai log` flat, then `Hello`/`bhai` slam to Anton uppercase vermilion and `Hello`'s five extra `o`s type in. Labels `every other captioning app` → `same audio`.
2. It heard you get angry — 3.5s — `itna bekaar tha yaar` builds word by word; `itna/bekaar/tha` flip to CAPS 900 `#FF5C3A` and shake; badge `Detected · angry`.
3. Not an LLM wrapper — 4.5s — headline + `Hello` large + three mono readout rows (`+1.20σ`, `+1.80σ`, `+646ms`) then the verdict `→ emphasis · excited · stretch ×2.60`.
4. You don't need to edit. Just talk. — 3.5s — editor shell, mic goes live, `put a fire emoji on the word bekaar` types in, two real tool chips land, 🔥 pops onto the word on the stage, `validated · 1 word updated`.
5. The tone layer rides every preset — 2.91s — `itna bekaar tha` cycles Rangmanch → Chamak → Dhamaka with the shake never resetting.
6. Outro — 3s — "Stop typing captions. / Start saying them." split apart, wordmark lands over the sunset stripe, mono footer.

### Non-negotiable implementation details
These are product-accuracy requirements, not styling preferences:
- **The angry shake is clock-driven, not a CSS keyframe loop.** Use `x = sin(t/18) * A`,
  `y = cos(t/13) * A * 0.6` with `A` = the preset's shake amplitude (3 / 4 / 5) and `t` in ms of
  composition time. The two periods are deliberately incommensurable so the motion never visibly
  repeats — a looping CSS shake would misrepresent the product. Keep it seek-safe (pure function of
  composition time).
- **In Scene 5 the shake must not reset, pause or restart across the three preset swaps.** Drive it
  from one continuous clock. That continuity *is* the scene's claim.
- **Stretch is spelled by repeating the final letter, one extra letter per 120ms of measured hold,
  max 5.** `Hello` + 646ms → `Helloooooo` (5 extra `o`s, hitting the `maxRepeats` cap). Animate the
  extra letters in one at a time. Never alter any other word's spelling.
  *Do not use `saaaal` from `real_reel-project.json`: that word's `Word.text` already carries the
  repeats, which `caption-style.ts:229` names as bad upstream data — it would show the symptom
  instead of the mechanic.*
- **Emphasis is a typeface change AND a scale change together**, not a colour swap. Rangmanch goes
  Instrument Serif italic body (82px) → Anton UPPERCASE `#E2452A` (170px).
- **Word gaps must be sized against the caption type, not the root font size.** A `0.28em` gap on a
  flex row that inherits 16px collapses to ~4px and runs the words together; use explicit pixel gaps.
- Use the real `σ`, `×`, `·`, `→` characters as written. Verified rendering in headless Chrome.

## Audio
- Audio role: warm bed with sparse, motion-matched accents
- Audio arc: the bed runs unbroken from frame one, lifts slightly through the angry flip, steps back
  for the Scene 3 readout so the numbers can be read against near-silence, picks up light mechanical
  accents under the typed command and tool chips, then ducks for one dry hit on the wordmark and
  fades out over the final ~0.6s.
- Music: `assets/music/happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (87.6s, ~114.84 BPM) — already copied in.
- Music treatment: start at 0.0s, modest bed level throughout, slight duck under the Scene 3 readout
  and again under the outro wordmark so the final hit rings, fade out the last ~0.6s. No hard cut.
- Music cue guidance: bundled preset at
  `/home/shubh/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.{md,json}`
  (tempo 114.84 BPM). Target strong cues: **1.60s** (hook slam), **12.65s** (agent patch lands),
  **17.91s** (outro wordmark). Beat-grid windows: Scene 2 word build ~4.23-5.80s; Scene 3 readout
  rows ~8.44 / 9.50 / 10.54s (**every other beat** — consecutive beats are ~0.52s apart, which
  outruns reading for numeric text); Scene 5 preset swaps ~14.76 / 15.81 / 16.86s.
- Audio-reactive treatment: **subtle**. Use music RMS/bass to breathe the coral glow behind the
  caption stage and the presence of the caption card. Nothing else. Explicitly no waveform bars, no
  equalizer, no musical-note graphics, no particle systems, no strobing, no heavy pulsing.
- Audio-coupled moments:
  - Scene 1 emphasis slam — soft impact, beat-locked to 1.60s; tiny ticks on the three letter repeats
  - Scene 2 word build — 4 words arriving on the beat grid
  - Scene 4 typed command — light key ticks per character
  - Scene 4 tool chips — one short interface cue per chip, firing with the visual
  - Scene 4 pink flip — beat-locked to 12.65s
  - Scene 5 preset swaps — one light cue per swap, exactly with the visual
  - Scene 6 wordmark — one dry hit, beat-locked to 17.91s
- SFX selection guidance: sparse and motion-matched. Interface/keyboard families for the typing and
  chips; a short announcement-style cue for the wordmark; restraint everywhere else.
- SFX analysis guidance: `/home/shubh/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/sfx/sfx-analysis.md`
  (and the `.json`). Prefer lower high-frequency-risk files — the edit is polished, not chaotic.
- **Restraint rule:** no SFX on any frame where a new line of copy is being read for the first time,
  and nothing percussive during the Scene 3 readout rows.
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the
  implemented animation.
- Audio files: copy any Hyperframes-selected SFX into `brag-output/composition/assets/`.

## Reading-time floor (hard requirement)
`check`'s layout pass plus this rule govern legibility:
- Short mono label or 1-3 word line: **≥0.8s fully settled** (entered, not yet exiting).
- Headline or full sentence: **≥0.3s per word, minimum 1.2s.** The Scene 1 hook line and the Scene 3
  headline get the most.
- Scene 3's three readout rows are numeric text the viewer must actually parse — hold each ≥0.8s and
  keep all three on screen together beneath the verdict. Do not snap them to consecutive beats.
- Scene 5's preset swaps are re-renders of a line already read, so beat-rate swapping is safe there.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract +
`data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats,
audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/
render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and
do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions
over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact animation timing and
  should ignore cues that hurt readability, scene pacing, or the product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to
  nearby beat points within about 0.10s. Use only 1-3 strong cue locks unless the edit clearly benefits.
- Honor the planned music treatment (bed, two ducks, final fade) using the best Hyperframes-supported
  implementation.
- Use the Hyperframes audio-reactive workflow to extract audio data and wire the coral glow / card
  presence to RMS. If extraction is unavailable, note it and skip — do not block the render.
- Use local assets for audio and any required runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate. Fix every error including WCAG
  contrast. Note: the palette was chosen so coral `#ff6b4a` and blue-violet `#8B98F0` on `#05060a`
  clear AA; if a contrast error appears, adjust within the palette family rather than leaving it.
