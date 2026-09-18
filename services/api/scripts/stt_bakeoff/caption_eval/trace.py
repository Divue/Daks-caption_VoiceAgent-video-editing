import json,sys
from pathlib import Path
P=Path(__file__).resolve().parent/"evidence"/"stage-outputs"/sys.argv[1]
L=lambda n: json.loads((P/n).read_text())
B="\033[1m"; E="\033[0m"
def hdr(t): print(f"\n{'═'*100}\n{B}{t}{E}\n{'═'*100}")

a=L("01_audio.json"); hdr("STAGE 1 — AUDIO")
print(f"  IN   clips/{sys.argv[1]}.mp4")
print(f"  OUT  16kHz mono WAV · {a['durationMs']/1000:.1f}s · {a['samples']:,} samples")

t=L("02_transcribe.json"); hdr("STAGE 2 — AWS TRANSCRIBE hi-IN   (the only source of word timings)")
print(f"  IN   the WAV (via S3)")
print(f"  OUT  {t['nWords']} words, Devanagari, each with start/end ms + confidence\n")
print(f"       transcript: {t['devanagari'][:88]}...")
print(f"\n       first 8 words as they come back:")
print(f"       {'i':>3} {'devanagari':<12}{'asr roman':<12}{'startMs':>8}{'endMs':>7}")
for w in t["words"][:8]:
    print(f"       {w['i']:>3} {w['dev']:<12}{w['asrRoman']:<12}{w['startMs']:>8}{w['endMs']:>7}")

s=L("03_sarvam.json"); hdr("STAGE 3 — SARVAM translit   (best Roman text, NO timings)")
print(f"  IN   the same WAV")
print(f"  OUT  one string, {s['elapsedS']}s, word timestamps: {s['wordTimestamps']}\n")
print(f"       {s['text'][:190]}")

p=L("04_prosody.json"); hdr("STAGE 4 — PROSODY (librosa, local CPU)")
print(f"  IN   the WAV samples")
print(f"  OUT  {p['frames']} frames @ {p['hopMs']}ms of energy + pitch, and clip baselines:")
print(f"       noise floor {p['floorDb']} dB · speech level {p['speechDb']} dB")
print(f"       clip median loudness {p['clipMedianDb']} dB · clip median pitch {p['clipMedianF0']} Hz")
print(f"       (these baselines are what make later scoring relative to THIS speaker)")

sn=L("05_snap.json"); hdr("STAGE 5 — ENVELOPE SNAP   (free fix for Transcribe's bad timings)")
print(f"  IN   Transcribe's {t['nWords']} word spans + the energy envelope")
print(f"  OUT  {sn['nIslands']} speech islands; {sn['nMoved']} words moved onto real speech\n")
print(f"       biggest corrections:")
print(f"       {'word':<12}{'was':<18}{'now':<18}{'shift'}")
for m in sorted(sn["moved"],key=lambda x:-x["shiftMs"])[:6]:
    print(f"       {m['word']:<12}{str(m['fromMs']):<18}{str(m['toMs']):<18}{m['shiftMs']}ms")

b=L("06_bedrock.json"); hdr("STAGE 6 — BEDROCK CLAUDE   (reconcile 2 transcripts, expressive spelling, lines)")
print(f"  IN   Sarvam Roman text + Transcribe Devanagari words + per-word acoustics")
print(f"  OUT  {len(b['lines'])} caption lines, Roman, with a tone each")
print(f"       {b['tokensIn']} in / {b['tokensOut']} out · {b['elapsedS']}s · ${b['costUsd']}\n")
for i,ln in enumerate(b["lines"]):
    print(f"       [{ln['tone']:<7}] {' '.join(w['text'] for w in ln['words'])}")

sc=L("07_scored.json"); hdr("STAGE 7 — BUDGETED SCORING   (numbers decide intensity, not the LLM)")
print(f"  IN   the reconciled words + acoustics")
print(f"  OUT  emphasis 0-3 and hold 1.0-4.0, ranked WITHIN this clip")
print(f"       emphasis>=2 on {sc['pctEmphasis2plus']}% of words · held: {sc['pctHeld']}%  (budget keeps this ~12-15%)\n")
print(f"       {'word':<14}{'startMs':>8}{'endMs':>7}{'emph':>6}{'hold':>6}{'empPct':>8}{'holdPct':>8}  verdict")
for w in sc["words"]:
    if w["emphasis"]>=2 or w["hold"]>1.0 or w["stretchVerdict"]!="-":
        print(f"       {w['text']:<14}{w['startMs']:>8}{w['endMs']:>7}{w['emphasis']:>6}"
              f"{w['hold']:>6.1f}{w['empPct']:>8.2f}{w['holdPct']:>8.2f}  {w['stretchVerdict']}")

pr=L("08_project.json"); hdr("STAGE 8 — PROJECT JSON   (what Remotion renders)")
print(f"  OUT  {len(pr['words'])} words + {len(pr['lines'])} lines\n")
print(json.dumps({"id":pr["id"],"durationMs":pr["durationMs"],"presetId":pr["presetId"],
  "words":pr["words"][:4]+[{"...":f"{len(pr['words'])-4} more"}],
  "lines":pr["lines"][:3]+[{"...":f"{len(pr['lines'])-3} more"}],
  "settings":pr["settings"]},indent=1)[:1500])
