"""Forced alignment with torchaudio MMS_FA (romanized multilingual CTC aligner).
Text comes from the ground truth; we ask only: does it time the words correctly?"""
import json, re, sys, time
from pathlib import Path
import torch, torchaudio, numpy as np

ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
OUT=Path(__file__).resolve().parent/"out"; OUT.mkdir(exist_ok=True)
bundle=torchaudio.pipelines.MMS_FA
model=bundle.get_model(with_star=False)
DICT=bundle.get_dict(star=None)
print("loaded MMS_FA, dict size", len(DICT))

def norm(w):
    w=re.sub(r"[^a-z']","",w.lower())
    return w
for clip in ["Excited_long_texts","Angry","Normal","Real_reel"]:
    t0=time.time()
    import soundfile as sf
    _a,sr=sf.read(str(ROOT/"audio"/f"{clip}.wav"),dtype="float32")
    wav=torch.from_numpy(_a).unsqueeze(0)
    if sr!=bundle.sample_rate:
        wav=torchaudio.functional.resample(wav,sr,bundle.sample_rate); sr=bundle.sample_rate
    truth=(ROOT/"truth"/f"{clip}.txt").read_text()
    raw=[w for w in re.findall(r"[A-Za-z']+",truth)]
    words=[norm(w) for w in raw]
    # keep only chars the model knows
    toks=[[DICT[c] for c in w if c in DICT] for w in words]
    keep=[i for i,t in enumerate(toks) if t]
    toks=[toks[i] for i in keep]; kraw=[raw[i] for i in keep]
    with torch.inference_mode():
        emission,_=model(wav)
    ali,scores=torchaudio.functional.forced_align(
        emission, torch.tensor([[i for t in toks for i in t]],dtype=torch.int32), blank=0)
    spans=torchaudio.functional.merge_tokens(ali[0],scores[0].exp())
    ratio=wav.size(1)/emission.size(1)/sr
    # regroup token spans into words
    out=[]; k=0
    for w,t in zip(kraw,toks):
        seg=spans[k:k+len(t)]; k+=len(t)
        if not seg: continue
        out.append({"text":w,"startMs":int(seg[0].start*ratio*1000),
                    "endMs":int(seg[-1].end*ratio*1000),
                    "score":round(float(np.mean([s.score for s in seg])),3)})
    el=time.time()-t0
    (OUT/f"fa.{clip}.json").write_text(json.dumps(out,indent=1))
    print(f"\n=== {clip}  ({el:.1f}s) ===")
    for w in out:
        star="  <<< HELD" if re.search(r"(.)\1{2,}",w["text"].lower()) else ""
        if star or w["endMs"]-w["startMs"]>400:
            print(f"   {w['text']:<14}{w['startMs']:>6}-{w['endMs']:<6} dur{w['endMs']-w['startMs']:>5}ms sc{w['score']:.2f}{star}")
