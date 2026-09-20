# Brag Plan: Expressive Captions

## What is this app?
A web editor that auto-captions Hinglish short-form video with **tone-aware** captions — emphasis,
stretched words and an angry shake read from the audio itself — and lets creators edit them by
talking to it. What makes it land: every other captioning app writes down *what* you said; this one
writes down *how* you said it.

## The angle
Show the same Hinglish sentence twice. Once flat, the way every captioning app writes it. Once as
Expressive Captions writes it, with the held syllable stretched and the loud words red and shaking.
The difference is the entire pitch, and it needs no explanation — so the video never explains the
product in the abstract. Everything on screen is real: real fixture words, real measured σ values,
real preset colours, real agent tool names, real shipped copy.

## Hook (first 2-3 seconds)
A plain white caption reads `Hello bhai log`. It holds just long enough to look ordinary. Then it
re-renders: `Hello` and `bhai` slam into Anton uppercase vermilion (both are `emphasis: true`) and
`Hello`'s five extra `o`s type in one at a time. A mono label swaps from `every other captioning
app` to `same audio`. That one substitution is the product.

**Fixture note (decided during build):** the storyboard originally used `saaaal` from
`real_reel-project.json`. That word's `Word.text` already has the repeats baked in — which
`caption-style.ts:229` explicitly calls bad upstream data — so it would have shown the *symptom*
rather than the mechanic. `demo-project.json` (the canonical shared fixture) is the one where the
mechanic reads honestly: clean text `Hello` in, `renderedText()` adds exactly 5 letters from the
measured 646 ms hold (646/120, rounded, capped at `maxRepeats` 5).

## Key moments (the middle)
- The angry run `itna bekaar tha yaar` flipping to CAPS / weight 900 / `#FF5C3A` and physically
  shaking, with a `Detected · angry` badge — the effect nobody else ships.
- The signals readout resolving `Hello`: `Loudness +1.20σ`, `Pitch +1.80σ`, `Held +646ms` →
  `→ emphasis · excited · stretch ×2.60`. Real arithmetic, under the headline
  "Not an LLM wrapper. / We measure your voice."
- A spoken command becoming a validated JSON patch: `put a fire emoji on the word bekaar` →
  `find_words  query "bekaar" · matchType contains` → `set_emoji  wordIds [w12] · emoji 🔥` →
  🔥 pops onto the word on the stage → `validated · 1 word updated`.
- The same angry line cycling three preset faces with the shake persisting through all of them —
  the tone layer is not baked into one style, it rides on every preset.

## Outro / punchline
"Stop typing captions. / Start saying them." — the product's own closing line, second line coral,
split apart the way the real landing page animates it. Then the wordmark over the sunset stripe.

## User flow worth showing
Three beats, all in Scene 4: **entry** — the editor with a 9:16 stage and a command bar;
**key action** — the mic goes live and a Hinglish-flavoured command is spoken/typed;
**result** — two real agent tool chips land and the caption on the stage visibly changes,
confirmed by `validated · 1 word updated`. Scenes 1–2 show the pipeline's *output* (the captioned
frame), which is the other half of the flow — upload → captions that already know your tone.

## Tone
- Preset: default
- Creative direction: a creator-tool launch that lets the captions do the talking
- Interpretation: comfortable 3–4.5s scenes, mixed case, clean slides and crossfades, one idea per
  scene. Energy comes from the caption effects themselves (slam, shake, stretch), not from cutting
  fast. Warm and direct, never corporate.

## Format: landscape — 1920x1080
## Duration: 21.5 seconds (as built: 6 scenes, exact)

## Visual identity (from the project)
Source: `apps/web/src/index.css:182-296` (`@theme`, the landing system) and
`packages/shared/src/presets.ts` (the caption faces).

- Background: `#05060a` (landing hero root, `index.css:438`); panels `#111114`; hairlines `#242429`
- Accent: `#ff6b4a` (`--color-signal`) — headline line 2, CTAs, playhead, emphasis underlines
- Voice/AI accent: `#8B98F0` (`VoiceSphere.tsx:365` `MIC_ACCENT`) — mic-live state, pitch line
- Text: `#f5f5f7` primary / `#a3a3ad` secondary / `#8c8c98` mono micro-labels
  (the app's own `#6b6b75` measures 3.66:1 on this canvas; raised to clear WCAG AA, which
  `hyperframes check` gates as an error)
- Display font: General Sans 600/700 (Fontshare, `--landing-font-display`)
- Body font: Inter; micro-labels and all numerics in JetBrains Mono
- Caption faces (real `CAPTION_FONTS`): Anton, Instrument Serif italic, Montserrat 800, Inter 800
- Preset colours: Rangmanch emphasis `#E2452A`, angry `#FF5C3A` shake 3 · Chamak gold
  `#FFAE1A→#FFC44D→#FFE7A8→#FFC44D→#FFAE1A` + 100px `#FFAE1A` glow · Dhamaka `#FF4D8D` on a 108px
  `#5E1130` glow
- Sunset stripe (outro only): `#fa520f → #ff8105 → #ffb83e → #ffd900 → #fff8e0`
- Strongest visual element: the caption frame itself — a 9:16 stage on a near-black field where one
  word is 2.93× its neighbours, vermilion, and shaking.

## Share copy (draft)
Every captioning app writes down what you said. Expressive Captions writes down how you said it —
stretched words, emphasis and an angry shake, read from the audio. In Hinglish. And you edit it by
talking to it.

## Angry layer, as built
The shipped emotion layer is *uppercase + weight 900 + colour + shake* (`presets.ts:295`). Weight
900 on Instrument Serif (a 400-only face) would synthesise a fake bold, so the angry words draw in
Montserrat 900 — a real cut at the weight the layer actually asks for. Colours and shake amplitudes
are the presets' exact values.

## Audio direction
- Role: warm bed with sparse, motion-matched accents
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (87.6s, ~114.84 BPM)
- Music treatment: in from 0.0s at a modest bed level, holds under the whole edit, ducks slightly
  under the outro wordmark so the final hit rings. No hard cut at the end — fade the last ~0.6s.
- Music cue guidance: bundled preset read from
  `assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.md`.
  Strong cues to target: **1.60s** (hook slam), **12.65s** (agent patch lands), **17.91s** (outro).
  Beat-grid windows for sequential reveals: Scene 2 word build ~4.23–5.80s; Scene 3 signal rows
  ~8.44 / 9.50 / 10.54s (every *other* beat — see restraint rule); Scene 5 preset cycle
  ~14.76 / 15.81 / 16.86s.
- Audio-reactive treatment: subtle. Use music RMS/bass to breathe the coral glow behind the caption
  stage and the presence of the caption card. Nothing else. No waveform bars, no equalizers, no
  particles, no strobing.
- SFX posture: sparse. A soft impact on the emphasis slam, light key ticks under the typed command,
  one dry hit on the wordmark landing. Prefer low high-frequency-risk files.
- Audio-coupled moments: the Scene 1 emphasis slam; the Scene 2 word-by-word build; the Scene 4
  typed command and the two tool chips; the Scene 6 wordmark.
- Restraint rule: audio must never compete with reading. No SFX on any frame where a new line of
  copy is being read for the first time, and nothing percussive during the Scene 3 readout rows.

## Storyboard (as built — exact times)

| # | Scene | Global window | Sub-composition |
| --- | --- | --- | --- |
| 1 | The same line, twice | 0.00 – 3.50 | `compositions/s1.html` |
| 2 | It heard you get angry | 3.50 – 7.00 | `compositions/s2.html` |
| 3 | Not an LLM wrapper | 7.00 – 11.50 | `compositions/s3.html` |
| 4 | You don't need to edit. Just talk. | 11.50 – 15.00 | `compositions/s4.html` |
| 5 | The tone layer rides every preset | 15.00 – 17.91 | `compositions/s5.html` |
| 6 | Outro | 17.91 – 21.50 | `compositions/s6.html` |

A standing background (near-black `#05060a`, the landing hero's 220px/44px grid pair under a radial
mask, a coral bloom and a vignette) runs untimed underneath all six, so the scenes cut but the world
does not.

### Scene 1 — The same line, twice — 3.5s
A flat caption, `Hello bhai log` in plain Inter 400 — what every captioning app writes. Mono label:
`every other captioning app`. It holds ~1.05s so it reads as ordinary. At **1.60s** it gives way to
the same audio through Rangmanch: `Hello` and `bhai` in Anton UPPERCASE `#E2452A` (both are
`emphasis: true` in the fixture), `log` in Instrument Serif italic `#FFF6E9`. Label swaps to
`same audio`. From 1.78s the five extra `o`s of `Hello` type in 60 ms apart — 646 ms of measured
hold at 120 ms per repeat, capped at 5. Settled 2.05 – 3.28.
Sequential/interaction: yes — 5 letter repeats, one at a time, then a ≥1.2s hold.
Audio-coupled: warm impact on the slam. Music: bed in.
Transition: hard cut → Scene 2. *// beat-locked: 1.60s (strongCue 1.00)*

### Scene 2 — It heard you get angry — 3.5s
`itna bekaar tha yaar` builds left to right on the beat grid (3.90 / 4.23 / 4.49 / 4.75), all four in
Instrument Serif italic cream. At **5.80s** the three angry words flip together to UPPERCASE /
Montserrat 900 / `#FF5C3A` and start shaking; `yaar` stays neutral cream, which is what makes the
boundary legible. 😒 pops onto `bekaar` (the fixture's own emoji) and a mono badge slides in:
`Detected · angry`. Settled 5.95 – 6.82.
The shake is `x = sin(t/18)·3`, `y = cos(t/13)·1.8`, ported from `CaptionRenderer.tsx:230` — clock-
driven, two incommensurable periods, so it never visibly loops and is identical under seek.
Audio-coupled: one soft impact on the flip. Nothing on the word arrivals — they are first reads.
Transition: clean slide → Scene 3. *// beat-locked: 5.80s (strongCue 1.00)*

### Scene 3 — Not an LLM wrapper — 4.5s
Headline (General Sans 600, line 2 coral), verbatim from `SignalsSection.tsx:50`:
**"Not an LLM wrapper." / "We measure your voice."** Left: `Hello` at 158px in Instrument Serif
italic under a coral rule, captioned `one word · demo-project.json`. Right: three mono readout rows
arriving on **every other beat** — `Loudness +1.20σ` (7.91), `Pitch +1.80σ` (8.96), `Held +646ms`
(10.01) — each holding ≥1.2s, all three still on screen when the verdict writes itself at 10.54:
`→ emphasis · excited · stretch ×2.60`.
Every number is the real `signals` block for that word in `packages/shared/fixtures/demo-project.json`.
Sequential/interaction: yes — 3 rows, one at a time. Consecutive beats are ~0.52s apart at 114.84
BPM, which outruns reading for numeric text, so they land every *other* beat.
Audio: the music ducks to 0.32 for this scene. No SFX at all — the numbers get near-silence.
Transition: clean slide → Scene 4.

### Scene 4 — You don't need to edit. Just talk. — 3.5s
A stylized editor: a 9:16 stage well left (`#0c0d0f`, `rounded-xl`, hairline ring) showing the angry
line from Scene 2, and a column right holding the headline, the tool chips and the command bar. The
mic goes live — coral radial fill with a stop square and three expanding ping rings. The command
types in with key ticks: `put a fire emoji on the word bekaar` (a real tested prompt from
`apps/web/src/lib/demo-prompts.ts`). Two chips land with the real registered tool names and their
real argument shapes: `find_words  query "bekaar" · matchType contains` (12.30), then
`set_emoji  wordIds [w12] · emoji 🔥` at **12.65**, where 🔥 pops onto the word on the stage. A third
chip confirms `validated · 1 word updated` (13.10) — the agent never edits pixels, it returns a
validated JSON patch. Headline overlay, verbatim from `TalkToEditSection.tsx:98`:
**"You don't need to edit." / "Just talk."** — arrives at 11.60 so it has 3.2s settled.
Sequential/interaction: yes — simulated voice input, character-by-character typing, 3 ordered chips.
Audio-coupled: 7 key ticks under the typing; a click, a soft impact and a warm confirm on the chips.
Transition: clean wipe → Scene 5. *// beat-locked: 12.65s (strongCue 1.00)*

### Scene 5 — The tone layer rides every preset — 2.91s
`itna bekaar tha` holds centre and cycles three of the seven real presets in place, with their exact
angry-layer values: **Rangmanch** `#FF5C3A` shake 3 → **Chamak** `#FF6B3D` shake 4 with the gold halo
(15.81) → **Dhamaka** `#FF2E6B` shake 5 on the oxblood `#5E1130` glow (16.86). The preset name swaps
underneath in mono. **The shake is driven by one continuous scene clock and never resets, pauses or
restarts across the swaps** — only the amplitude changes. That continuity is the claim. Mono line:
`7 presets · the tone layer rides on all of them`.
Sequential/interaction: yes — 2 swaps on the beat grid. These re-render a line the viewer has already
read, so beat-rate swapping is safe here in a way it is not in Scene 3.
Audio-coupled: one quiet click per swap, landing with the visual.
Transition: clean cut → Scene 6.

### Scene 6 — Outro — 3.59s
**"Stop typing captions." / "Start saying them."** arrive at **17.91**, line 2 coral, verbatim from
`ClosingSection.tsx:29`. Settled 18.21 – 20.02 (1.81s for 6 words). At **20.02** the lines part
vertically and fade to 0.16, clearing the centre; the wordmark **Expressive Captions** lands in the
gap, the sunset stripe (`#fa520f → #ff8105 → #ffb83e → #ffd900 → #fff8e0`) draws out beneath it, and
the mono footer resolves: `Hinglish · voice-first · built on AWS`.
Audio-coupled: one bell hit on the wordmark; music ducks to 0.34 under it, then fades to 0 by 21.50.

**Music mood for this video:** upbeat
**Audio summary:** A warm 114.84 BPM bed fades in over 0.45s and runs unbroken, ducking to 0.32 for
the Scene 3 readout so the numbers land in near-silence, returning to 0.5 for the agent scene where
it picks up key ticks and interface cues, then ducking to 0.34 for one bell hit on the wordmark and
fading out over the last 0.6s. Eight SFX moments in 21.5 seconds (15 cues, 7 of them the key ticks
under the typed command) — nothing fires while a line of copy is being read for the first time, and
Scene 3's readout has none at all.

Measured on the final render: integrated loudness **-21.4 LUFS**. That is deliberately a background
bed with no voiceover under it; platforms that normalise to ~-14 LUFS will bring it up on playback.

## Audio-reactive treatment, as built
One element only: the coral bloom behind the caption stage. Its opacity tracks the track's bass
(`0.4 + bass × 0.3`) and its scale tracks overall RMS (`0.97 + rms × 0.06`), sampled per frame from
`assets/audio-data.js` — 646 frames pre-extracted at 30fps, the render's own frame rate, so a frame
stays a pure function of its index. No Web Audio, no runtime analysis, and deliberately no waveform
bars, equalizers, particles or strobing.
