# STT bake-off

Decides which speech-to-text engine we ship (open decision on the plan doc). Timebox: 3 hours.

## 1. Clips
Put 4 clips in `clips/` (20–30s each, vertical phone video is fine):

| Clip | Content |
| --- | --- |
| clip1 | normal Hinglish talking, calm |
| clip2 | stretched words on purpose ("hellooo", "whaaat", "arreee") |
| clip3 | one shouted/angry section plus normal speech |
| clip4 | a real reel: background music, phone mic, fast speech |

## 2. Ground truth
`python bakeoff.py prepare` makes `audio/*.wav` and an empty `truth/<clip>.txt` per clip.
Type into each truth file what was actually said, in Roman script, the way you want it captioned.
Without this there is no score, only vibes.

## 3. Run
```bash
export $(grep -v '^#' ../../../../.env | xargs)   # AWS keys, S3_BUCKET, BEDROCK_MODEL_ID
python bakeoff.py run transcribe-en transcribe-hi scribe
python bakeoff.py romanize transcribe-hi          # Devanagari -> Roman via Bedrock
python bakeoff.py score
```
Engines: `transcribe-en`, `transcribe-hi`, `scribe` (needs `ELEVENLABS_API_KEY`),
`whisper` (needs `pip install faster-whisper`, downloads ~3GB).

## 4. Decide
Pick the cheapest engine within ~5 percentage points of the best word error rate. Ties go to the one
whose word timings you trust: stretch and emphasis detection depend entirely on them.

The score table cannot judge timings. Per clip, spot-check about 5 words by hand: open the JSON in
`out/`, pick a word, seek to its `startMs` in any player, and check the word is being said there.
Also check that stretched words get long durations, and that Roman spelling reads the way creators
write (bhai, nahi, kya).

Write the winner into the plan doc's open decisions, and into `CLAUDE.md` under Stack.
