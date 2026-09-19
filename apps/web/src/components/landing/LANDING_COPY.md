# Landing copy bank

The positioning and lines for the landing page, collected from the repo owner's brief (2026-09-19)
plus new lines written from it. Pick lines from here when building sections. **Before shipping a
line, check its status tag**: this page makes no claim the product does not back up.

Status tags:
- **[ok]** verified against the code on 2026-09-19 (the source is named).
- **[check]** true in spirit, but needs a measurement or a decision before it ships.
- **[no]** do not use it, and why.

---

## 1. What we are, in one breath

A captioning app that listens to *how* something was said, not just *what*: tone-aware captions for
Hinglish short-form video, edited by talking to it.

## 2. What makes us different (the pillars)

1. **Captions that feel what you said.** Emotion drives the look: angry words shake and turn hot,
   held words stretch out on screen, stressed words get the display face.
   [ok] `Word.emotion` (neutral/angry/excited), `EMOTION_STYLES` and each preset's own `emotion`
   override (`angry → shake + colour`), `Word.stretch`, `Word.emphasis`.
2. **Not an LLM wrapper: we measure the audio.** For every word we measure loudness, pitch, duration
   and how long it was held against the speaker's own baseline. Emphasis and stretch come from those
   numbers, not from a model guessing from the text.
   [ok] `Signals` (loudnessZ, pitchZ, durationRatio, extraMs) in `project.ts`; `pipeline/prosody.py`
   (librosa + ffmpeg). The z-scores are per speaker.
3. **Made for Hinglish.** Transcribed from Hindi and written back in the Roman script Hinglish
   creators actually type ("yaar", "bhai", "saaaal").
   [ok] `pipeline/stt.py`: Transcribe hi-IN, then word-level transliteration; Sarvam translit as
   an alternative (`pipeline/run.py`).
4. **Presets that react.** Every preset is a base look, with emphasis and emotion as layers on top,
   so the same angry word looks different in each style but always reads as angry.
   [ok] `PRESETS` with 7 presets; the emphasis and emotion layers in `presets.ts`.
5. **Edit by talking.** "Make that word red", "shake it when I'm angry", "bigger captions": say it
   and the agent changes the project for you. No timeline skills needed.
   [ok] `services/api/app/agent` (Bedrock tool use, validated patches) and the voice path
   (LiveKit, audits `talk-and-edit/`).
6. **Export and post.** A finished, captioned video at your clip's own size, ready for Reels,
   Shorts or TikTok.
   [ok] Remotion export at the project's width × height (`remotion/src/Root.tsx`).

## 3. Line bank

### Headlines (hero or section openers)
- Captions that feel what you said. [ok]
- Your voice has a mood. Your captions should too. [ok]
- Angry? It shakes. Stretching a word? So does the caption. [ok]
- Tone-aware captions for Hinglish creators. [ok]
- Just talk. We'll edit. [ok]
- Talk to your edits. [ok]
- The short-form editor that listens. [ok]
- Not another auto-caption. [ok, as long as the next line says why]
- Captions with feelings, made for Hinglish. [ok]
- Stop explaining your captions to an editor. Say it to the app. [ok]

### Problem lines (the "why")
- Auto-captions get the words right and the feeling wrong.
- Every caption tool treats a shout and a whisper the same.
- The captions that go viral are the ones someone styled by hand, word by word. That takes hours,
  or an editor you pay per video.
- Hiring an editor for expressive captions on every reel doesn't scale.
- Most caption apps are built for English, and Hinglish comes out garbled or in the wrong script.

### Differentiator lines
- We don't guess the emotion from the text. We measure it in your voice. [ok]
- Loudness, pitch, duration and held time: measured for every single word. [ok]
- Say "saaaal" and the caption says "saaaal" too. [ok; the stretch is measured, see `renderedText`]
- Shout a word and watch it shake. [ok, `shake` on angry]
- The stressed word gets the spotlight automatically. [ok, `emphasis` from prosody]
- Seven styles, one emotional engine underneath. [ok, 7 = `PresetId.options.length`]
- Written the way you text: Hinglish in Roman script, not Devanagari, not a bad translation. [ok]
- No captioning app for India reads the sentiment in your voice. [check: a competitive claim, so
  confirm it before shipping, or soften to "Built for India, built around emotion"]

### Voice-editing lines
- You don't need to know how to edit. You need to know what you want. [ok]
- "Make that word red." Done. [ok]
- Talk to your edits, then post to your favourite app. [ok]
- An editor that takes direction. [ok]
- Every change is checked before it lands, so talking can't break your project. [ok, patches are
  validated against the schema]

### Ease / "one click" lines
- Upload. Captions appear. Talk to tweak. Export. [ok]
- One upload, and the captions are done. [check: there is no literal single button; the flow is
  upload → automatic pipeline. "One upload" is accurate, "one click" is a stretch]
- Made for creators, not editors. [ok]

### India / audience lines
- Made in India, for how India talks. [ok in spirit; check "made in India" is how the team wants to
  say it]
- Hinglish first. [ok]
- Hindi and English, captioned separately too. [check: the pipeline is hi-IN plus transliteration
  today; no separate English-only or Devanagari output mode was found in `services/api`. Ship
  this only once those modes exist]

### CTA microcopy
- Add captions → [ok]
- Start creating → [ok, the existing navbar CTA]
- Try it on your own clip → [ok]
- Upload a reel → [ok]

## 4. Do not say
- Speed claims ("in seconds", "5 minutes"): [no] not measured end to end.
- Accuracy percentages ("99%"): [no] never measured.
- Language counts ("20+ languages"): [no] it's Hinglish via hi-IN.
- "Free": [no] there is no pricing model.
- Users, creators served, testimonials, logos, "trusted by": [no] none exist.
- "Fully automatic, no editing ever": [no] the agent helps, but the user still reviews.
- "Exported audio": the export is a captioned **video** file.
