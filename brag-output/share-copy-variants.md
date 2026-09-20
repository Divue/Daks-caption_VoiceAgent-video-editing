# Share copy variants

`share-copy.txt` is the canonical caption. These are alternates.

## Short (X / Twitter)
Every captioning app writes down what you said.
Expressive Captions writes down *how* you said it — stretched words, emphasis and an angry shake, read straight off the audio. In Hinglish. Edited by voice.

## The thread hook (the STT bake-off — strongest technical claim, needs a table)
We measured three ways to caption Hinglish across four real clips:

- Sarvam transliteration — 0.218 mean WER
- AWS Transcribe `hi-IN` + Bedrock romanisation — 0.239
- AWS Transcribe `en-IN` — 0.478

The obvious approach (treat Hinglish as Indian English) returned an **empty transcript** on the one real Instagram reel in the set. Hindi model plus transliteration is the thing that works.

## The design note
We let the LLM own text and semantics, and gave intensity to arithmetic.

When the model was allowed to assign emphasis itself, it marked nearly every word in a deliberately calm clip as "hype." It has no sense of a baseline. So emphasis and stretch come from percentile-ranked loudness, pitch and hold against the speaker's own baseline — and the model only does what it's good at.

## LinkedIn
Built at the AWS First Commit hackathon: Expressive Captions, a caption editor for Hinglish short-form video.

Most captioning tools treat a whisper and a rant the same. This one measures loudness, pitch, duration and hold for every word against the speaker's own baseline, then draws that back into the caption — emphasis, stretched syllables, an angry shake. You edit it by talking to it; every voice command becomes a JSON patch validated against the schema before it touches your video.
