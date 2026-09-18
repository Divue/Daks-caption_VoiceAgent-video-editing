# 11 — Transcription + prosody pipeline (STT → expressive captions)

**Area:** `services/api` (P1-owned) · produces the `Project` JSON that `apps/web`
and `remotion/` consume.
**Status:** designed, built and measured end-to-end on all 4 test clips. **Not yet
wired into the API, the editor, or Remotion.** Nothing in `services/api/app/` was
changed by this work.
**Date:** 2026-09-18.

This document is an audit of an architecture + validation session. Everything below
labelled *measured* was run on the real clips in `services/api/scripts/stt_bakeoff/clips/`.
Anything labelled *assumed* was not verified. Read that distinction carefully — several
plausible ideas failed when measured.

> ## Which code do we ship? Read this first.
>
> **Ship `services/api/app/pipeline/` — the existing module. Not the eval harness.**
>
> This session was asked to ignore that module's design and form an independent view.
> It did, and **independently converged on the same architecture**: Sarvam for text,
> Transcribe for timings, the two aligned; prosody as arithmetic; the LLM used narrowly
> for semantics. Two designs arriving separately at the same answer is the strongest
> evidence in this document.
>
> Where `app/pipeline/` is **better** than the harness:
> - `align.py` matches Sarvam↔Transcribe with Needleman-Wunsch over *phonetic keys*
>   (via `indic-transliteration`, already in `requirements.txt`). The harness instead
>   asked Bedrock to reconcile the two transcripts — and hit exactly the failure
>   `align.py`'s docstring predicts: *"An LLM asked to align 95 tokens will quietly drop
>   one and shift every timestamp after it."* Bedrock dropped word index 94 on Real_reel
>   and produced "us din din". **Use the deterministic aligner.**
> - `tag.py` already carries the two-part stretch test (ratio vs speaker median **and**
>   an absolute floor) that the harness only rediscovered after producing false positives
>   on Real_reel. Same rule, same reasoning, same named failure case (`track` at 2.6×).
> - Its anger reasoning is sharper: anger lives in the *words*, audio only vetoes quiet
>   ones — because in a clip angry throughout, nothing stands out against the speaker's
>   own baseline. The harness's line-level tone does not handle that case as cleanly.
> - Practical caps the harness lacks: `MAX_WORD_CHARS` (captions must fit the frame),
>   `MAX_ANGRY_WORDS`, and graceful fallback when Sarvam is down.
>
> What this session contributes is **evidence, not a better implementation**: the
> measured tables in §2, the negative results in §4 (Sarvam modes, Whisper, MMS_FA),
> the missing `lines[]` schema gap in §6, and a reusable harness to tune
> `tag.py`'s thresholds against ground truth.
>
> **So: keep `app/pipeline/` as the implementation. Use `caption_eval/` as its test
> harness.** The architecture description below applies to both — where they differ,
> `app/pipeline/` wins on alignment and `caption_eval/` has the numbers.
>
> Caveat: `app/pipeline/align.py` and `run.py` are **uncommitted and untested** — there
> are no tests anywhere in `services/api`. Its thresholds were set by eye on the Day 1
> clips. First job for whoever picks this up: run it against the 4 clips and the truth
> files, and tune `tag.py` using the harness.

---

## 1. Recommended architecture

```
video → ffmpeg 16k mono wav → S3
  ├─ AWS Transcribe batch hi-IN  → word timings  (ONLY source of these)
  ├─ Sarvam translit             → best Roman Hinglish text, 1-2s, NO timings
  ├─ librosa                     → per-word loudness / pitch / voiced-time
  └─ conservative envelope snap  → repairs only provably-broken timings
         ↓
  Bedrock Claude — receives BOTH transcripts + per-word acoustics,
  reconciles them, marks held words, splits caption lines, assigns line tone
         ↓
  budgeted numeric scoring  → emphasis 0-3, stretch 1.0-4.0
         ↓
  Project JSON → Remotion
```

**The load-bearing idea:** the LLM owns *text and semantics*; arithmetic owns
*intensity*. When the LLM was allowed to assign emphasis/tone levels it marked
nearly every word in the deliberately-calm clip as "hype" with emphasis 2–3. It has
no sense of a baseline. Percentile ranking within a clip gives controlled sparsity
by construction.

### Stage I/O

*(As built in the eval harness. `app/pipeline/` differs at stage 6: it aligns
deterministically in `align.py` and calls Bedrock only to find anger. That is the
better arrangement — see the box above.)*

| # | Stage | In | Out |
|---|---|---|---|
| 1 | audio | `clip.mp4` | 16 kHz mono WAV |
| 2 | Transcribe hi-IN | WAV via S3 | Devanagari words + start/end ms + confidence |
| 3 | Sarvam translit | WAV | one Roman string, no timings |
| 4 | prosody (librosa) | WAV | 10 ms energy + pitch frames, clip baselines |
| 5 | envelope snap | words + envelope | repaired timings (only broken ones moved) |
| 6 | Bedrock Claude | both transcripts + acoustics | Roman lines, `held` flags, line tone |
| 7 | scoring | words + acoustics | `emphasis` 0–3, `stretch` 1.0–4.0 |
| 8 | project | all of the above | `Project` JSON |

A full worked trace of the Angry clip is reproducible with
`caption_eval/trace.py Angry` (see §9).

---

## 2. Measured results — all 4 clips

| clip | dur | words | lines | WER | emph | held | tones | Bedrock |
|---|---|---|---|---|---|---|---|---|
| Normal | 27.2s | 51 | 12 | 0.286 | 13.7% | 9.8% | 11 neutral, 1 hype | $0.025 |
| Excited | 13.9s | 15 | 4 | 0.308 | 13.3% | 13.3% | 3 neutral, 1 hype | $0.009 |
| Angry | 15.4s | 46 | 10 | 0.116 | 13.0% | 6.5% | 8 anger, 2 neutral | $0.023 |
| Real_reel | 23.4s | 94 | 22 | 0.151 | 14.9% | 2.1% | 21 neutral, 1 hype | $0.046 |

Mean content-WER **0.215**. WER is computed after collapsing repeated letters and
canonicalising Hinglish spelling variants (`nahi`/`nai`/`ni` → one token), so it
measures word errors, not spelling taste.

### Engine comparison (content-WER, lower is better)

| engine | Normal | Excited | Angry | Real_reel | mean |
|---|---|---|---|---|---|
| Sarvam `translit` | 0.286 | 0.308 | 0.116 | 0.161 | **0.218** |
| Transcribe hi-IN + Bedrock romanise | 0.306 | 0.385 | 0.116 | 0.151 | 0.239 |
| Transcribe en-IN | 0.510 | 0.077 | 0.326 | **1.000** | 0.478 |

`en-IN` returned an **empty transcript** on Real_reel. The Sep-18 decision to drop
it is confirmed, for a harder reason than WER.

### Timing quality (fraction of words whose interval sits at the noise floor)

| | mistimed |
|---|---|
| Transcribe raw | 13% |
| + conservative envelope snap | **~2–4%** |
| MMS_FA forced alignment | 8% |

Mean drift vs true speech onsets after the snap: Normal +2 ms, Real_reel −14 ms,
Angry +37 ms, Excited +73 ms.

---

## 3. What works, what doesn't

| feature | status |
|---|---|
| Hinglish Roman text | **works** — 0.215 mean WER, best available |
| Karaoke timing | **works** — 13% → ~2–4% mistimed |
| Line tone | **works** — calm clip 11/12 neutral, rant 8/10 anger; catches mid-rant shifts |
| Emphasis | **works** — 13–15% budget, lands on content words |
| **Elongation / stretch** | **weak** — ~3 true positives vs ~6 false across the corpus |

**Elongation is the known weak feature.** It works best on Excited (both held words
correct, including `guys` = "guuyyyssss" and `what` = "Whaaatt"), and produces only
false positives on Real_reel, which contains no held words at all. Ship it with the
`signals` exposed so the editor can show *why* a word was marked and make a wrong
call one click to fix.

**Sample-size caveat:** the corpus contains **7 stretched words across 4 clips**, and
Real_reel has zero emotion annotations. Every elongation precision/recall figure
carries roughly ±15 percentage points. The WER and timing numbers (207 aligned
words) are solid; the elongation numbers are directional only. *The cheapest way to
firm this up is to annotate ~10 more clips — worth more than any model change.*

---

## 4. Rejected alternatives (all measured, not assumed)

| option | why rejected |
|---|---|
| Transcribe `en-IN` | 0.478 WER; **empty output** on the real reel |
| Whisper `small` local, `en` | **translates** Hindi to English ("You know how I celebrate my birthday") |
| Whisper `small` local, `hi` | hallucinated Excited into 3 words ("साक्ता! साक्ता!"); 33–52 s on CPU |
| Sarvam as primary ASR | **no word timestamps in any mode** — verified live, 20 calls |
| Sarvam `verbatim` mode | does **not** preserve elongated spelling; character-identical to `transcribe` |
| LLM-assigned emphasis/tone levels | over-marks catastrophically; no baseline |
| MMS_FA forced alignment | see §5 |
| ElevenLabs / Deepgram | no API keys; user declined to purchase |

**Important negative result:** *no ASR available to this project preserves elongated
spelling.* Sarvam returns "Hello guys" for "Helloooo guuyyyssss" in all five modes;
Transcribe normalises identically. Expressive spelling must therefore be *inferred*
by the LLM from context + prosody, which is why that feature has a low ceiling.

### On MMS_FA (torchaudio forced aligner)

Meta's Massively Multilingual Speech aligner: wav2vec2 CTC, 315M params, 28-token
romanised vocabulary. It is **not** a recogniser — given audio *plus the text you
already know was said*, it finds where each character sits in time.

Measured: 1.26 GB weights, 2.71 GB peak RSS, 2.6 s for 14 s audio / 4.4 s for 23 s,
2.8 s cold load. Per-video AWS cost <$0.001 (own CPU). Real cost is structural:
a 4 GB App Runner instance instead of 2 GB (≈ +$25–35/month flat), ~3× image size.

**Verdict: not in the MVP.** The free envelope snap beats it on ordinary timing, and
MMS_FA's real advantage — knowing *which* word a long vowel belongs to — only pays
off once expressive spelling upstream is better than 33% precise. **Revisit it when
elongation becomes a priority; it is the mechanism for that feature, not an optimisation.**

---

## 5. Bugs found, and the lesson

Four bugs surfaced only during end-to-end integration; component tests caught none
of them. All are fixed in `caption_eval/pipeline.py`.

1. **Snap produced zero-width words.** Clipping a word to an island it didn't overlap
   gave 0 ms spans (34 of 206 words). Fixed by island assignment + proportional split.
2. **Emphasis landed on function words** — "should", "just", "the" instead of
   "fuck", "shit". Fixed with a Hinglish+English stopword penalty.
3. **Encoding stretch in the spelling corrupted text** — "STT"→"ST",
   "Benetton"→"Beneton". Fixed: `text` stays clean, magnitude lives in `stretch`,
   Remotion draws the repeats. This is what the existing schema already intended.
4. **Over-aggressive relocation destroyed good words.** The "is this word mistimed?"
   test read *quiet* as *silence*; in Real_reel it moved `ka` from a correct 160 ms
   span to a 40 ms one 561 ms later, and did the same to `sabse`, `ghatiya`,
   `shakkar`. At 60 fps those render for ~2 frames — they appeared not to render at
   all. Fixed: only relocate words genuinely at the noise floor or under 60 ms, never
   below a 90 ms floor, and skip a run entirely if there isn't room.

> **The lesson, stated plainly: every attempt to correct Transcribe's timings
> wholesale made things worse.** Transcribe is right far more often than a heuristic
> is. Repair only the small number of words that are provably broken, and prefer
> leaving a slightly-off timing over imposing a model.

A fifth, upstream: **Bedrock occasionally drops or off-by-ones a word index.** The
pipeline now re-inserts any index the LLM failed to emit, and skips the insert when
the neighbour already carries that text (which would duplicate it — this produced
"us din din").

---

## 6. Proposed schema changes (`packages/shared/src/project.ts`)

**Requires lead agreement + mirrored change in `services/api/app/schema.py`. Not made.**

| change | reason |
|---|---|
| **add `lines: [{id, tone, wordIds[]}]`** | The schema has no caption-line concept at all; `words` is flat. Remotion needs grouping regardless, and tone is per-line. |
| move `emotion` from `Word` → line `tone` | Per-word emotion is unstable and renders badly — one red word mid-sentence reads as a glitch; a whole line reads as anger. Measured: line-level tone tracks the mid-rant shift correctly. |
| `emphasis: boolean` → `0 \| 1 \| 2 \| 3` | Graded emphasis drives scale; boolean loses the budget. |
| add `confidence` to `Signals` | Lets the editor mark low-confidence stretches for review — the practical mitigation for weak elongation precision. |
| add `locked: boolean` to `Word` | So re-running the pipeline never stomps a manual edit. |

`stretch: z.number().min(1)` already matches the pipeline's `hold` exactly — no change.

---

## 7. Proposed API surface

Async job; the pipeline takes 20–40 s. Not implemented.

```
POST  /projects                    → create; returns presigned S3 upload URL
GET   /projects/{id}               → Project JSON
GET   /projects/{id}/status        → per-stage progress (stages map 1:1 to §1)
PATCH /projects/{id}/words/{wid}   → manual edit, schema-validated
POST  /projects/{id}/agent         → voice/text edit → validated patch (P4)
POST  /projects/{id}/render        → Remotion Lambda export
```

Design points worth arguing about before building:
- The client PUTs video **straight to S3**; video never passes through FastAPI.
- `status` exposes real per-stage progress, so the editor shows stages, not a spinner.
- `signals` ships to the client so the UI can explain *why* a word was marked.

---

## 8. Cost and latency, per 30 s video

| step | latency | cost |
|---|---|---|
| Transcribe batch hi-IN | ~11 s measured | $0.012 *(published rate, assumed)* |
| Sarvam translit | 0.7–2.0 s measured | *pricing not verified* |
| librosa prosody | 1.5 s measured | negligible |
| envelope snap | <0.1 s | negligible |
| Bedrock Claude Sonnet 4.6 | 4–15 s measured | ~$0.038 measured |
| **total** | **~30–45 s** | **~$0.05** |

The user has stated **Bedrock API cost is not a constraint**. The obvious lever that
opens: run the tagging pass 3× and majority-vote. Identical input produced different
held-flags across runs at `temperature=0`, so consensus would firm up both held words
and line tones for ~$0.11/clip. **Recommended before anything more clever.**

---

## 9. Where things live

| what | where |
|---|---|
| **production pipeline (ship this)** | `services/api/app/pipeline/` — `run.py`, `align.py`, `prosody.py`, `tag.py`, `stt.py`, `build.py` |
| eval harness (tune + measure against truth) | `services/api/scripts/stt_bakeoff/caption_eval/pipeline.py` |
| stage-by-stage trace printer | `services/api/scripts/stt_bakeoff/caption_eval/trace.py` |
| evidence scripts (WER, timing audits, forced-alignment A/B, Sarvam modes, Whisper) | `caption_eval/evidence/` |
| per-clip stage outputs (01–08 JSON per clip) | `caption_eval/evidence/stage-outputs/` |
| paid raw ASR output — do not re-spend | `services/api/scripts/stt_bakeoff/out/` |
| ground truth + emotion annotations | `services/api/scripts/stt_bakeoff/truth/` |
| visual caption preview (all 4 clips, real audio) | <https://claude.ai/artifact/23hchhqA1NXvyizLTGmqLz> |

Run: `cd services/api/scripts/stt_bakeoff && SARVAM_API_KEY=... .venv/bin/python caption_eval/pipeline.py Angry`
then `.venv/bin/python caption_eval/trace.py Angry`.

`caption_eval/` sits in **P1's folder** (`services/api`). It is scratch/evaluation
code, not production code, and was placed there to keep it beside the existing
bake-off. P1 should decide where it belongs when integrating.

**Dependencies note:** the evaluation venv has `librosa`, `soundfile`, `torch`,
`torchaudio`, `faster-whisper` installed for the experiments. **Only `librosa` +
`soundfile` are needed by the recommended pipeline.** Do not add torch or whisper
to `services/api/requirements.txt` — that image ships to production.

---

## 10. Open decisions for the next session

1. **Front-end target.** The request mentioned "Next.js"; the repo is Vite + React
   (`apps/web`, per root `CLAUDE.md` and audit 00). Confirm whether a migration is
   intended or whether this stays Vite — it changes nothing in the pipeline but
   everything in how the API is consumed.
2. **Schema change** (§6) — needs lead sign-off before any implementation.
3. **Where the pipeline runs.** App Runner container vs Lambda. Current design assumes
   the App Runner container (librosa needs ~200 MB of deps).
4. **3-vote Bedrock consensus** (§8) — cheap, addresses a measured flakiness.
5. **Sarvam as a hard dependency.** It is the best text source but a non-AWS vendor,
   and the hackathon rewards meaningful AWS usage. Transcribe + Bedrock + S3 still
   carry the architecture; confirm this trade is acceptable.
6. **Elongation.** Either accept it as a best-effort layer with UI affordances to fix
   it, or commit to MMS_FA (§4) and pay the deployment cost.
