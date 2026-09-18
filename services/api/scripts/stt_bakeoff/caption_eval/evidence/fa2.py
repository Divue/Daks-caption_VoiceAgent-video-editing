"""Realistic forced alignment: align the ASR's OWN romanized text (errors and all),
then score hold from the aligned durations. This is the production condition."""
import json,re,time
from pathlib import Path
import torch,torchaudio,numpy as np,soundfile as sf
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
OUT=Path(__file__).resolve().parent/"out"
bundle=torchaudio.pipelines.MMS_FA; model=bundle.get_model(with_star=False); DICT=bundle.get_dict(star=None)
def collapse(w): return re.sub(r"(.)\1+","\\1",re.sub(r"[^a-z]","",w.lower()))
def syl(w):
    c=collapse(w); return max(1,len(re.findall(r"[aeiou]+",c))) if c else 1
def align_words(clip, words):
    a,sr=sf.read(str(ROOT/"audio"/f"{clip}.wav"),dtype="float32")
    wav=torch.from_numpy(a).unsqueeze(0)
    toks=[[DICT[c] for c in re.sub(r"[^a-z']","",w.lower()) if c in DICT] for w in words]
    keep=[i for i,t in enumerate(toks) if t]
    tk=[toks[i] for i in keep]; kw=[words[i] for i in keep]
    with torch.inference_mode(): em,_=model(wav)
    ali,sc=torchaudio.functional.forced_align(em, torch.tensor([[i for t in tk for i in t]],dtype=torch.int32), blank=0)
    spans=torchaudio.functional.merge_tokens(ali[0],sc[0].exp())
    ratio=wav.size(1)/em.size(1)/sr
    out=[];k=0
    for w,t in zip(kw,tk):
        s=spans[k:k+len(t)];k+=len(t)
        if s: out.append({"text":w,"startMs":int(s[0].start*ratio*1000),"endMs":int(s[-1].end*ratio*1000)})
    return out
def truthmeta(clip):
    txt=(ROOT/"truth"/f"{clip}.txt").read_text()
    return [(w.lower(),bool(re.search(r"(.)\1{2,}",w.lower()))) for w in re.findall(r"[A-Za-z']+",txt)]
def lev(ref,hyp):
    m,n=len(ref),len(hyp);D=np.zeros((m+1,n+1),int);D[:,0]=np.arange(m+1);D[0,:]=np.arange(n+1)
    for i in range(1,m+1):
        for j in range(1,n+1): D[i,j]=min(D[i-1,j]+1,D[i,j-1]+1,D[i-1,j-1]+(ref[i-1]!=hyp[j-1]))
    i,j,p=m,n,[]
    while i>0 or j>0:
        if i>0 and j>0 and D[i,j]==D[i-1,j-1]+(ref[i-1]!=hyp[j-1]): p.append((i-1,j-1));i-=1;j-=1
        elif i>0 and D[i,j]==D[i-1,j]+1: p.append((i-1,None));i-=1
        else: p.append((None,j-1));j-=1
    return p[::-1]

allr=[]
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    d=json.loads((ROOT/"out"/f"transcribe-hi.{clip}.json").read_text())
    asr=[w["text"] for w in d["words"] if w.get("text")]   # ASR romanized text, WITH errors
    t=time.time(); fa=align_words(clip,asr); el=time.time()-t
    vps=np.array([(w["endMs"]-w["startMs"])/syl(w["text"]) for w in fa])
    for w,v in zip(fa,vps): w["vps"]=v; w["holdPct"]=float((vps<v).mean())
    tw=truthmeta(clip)
    for ri,hi in lev([collapse(x[0]) for x in tw],[collapse(w["text"]) for w in fa]):
        if hi is None: continue
        r=dict(fa[hi]); r["clip"]=clip; r["truth"]=tw[ri][0] if ri is not None else "—"
        r["isStretch"]=bool(ri is not None and tw[ri][1]); allr.append(r)
    print(f"{clip:<20} aligned {len(fa)}w in {el:.1f}s")

print(f"\n{'clip':<12}{'truth':<13}{'asr':<10}{'durMs':>7}{'ms/syl':>8}{'holdPct':>9}")
print("-"*62)
for r in allr:
    if r["isStretch"]:
        print(f"{r['clip'][:11]:<12}{r['truth'][:12]:<13}{r['text'][:9]:<10}"
              f"{r['endMs']-r['startMs']:>7}{r['vps']:>8.0f}{r['holdPct']:>9.2f}")
S=[r for r in allr if r["isStretch"]]
print(f"\n--- hold rule on FORCED-ALIGNED durations (ASR text) ---")
print(f"{'thresh':<10}{'tp':>4}{'fp':>5}{'fn':>4}{'prec':>7}{'recall':>8}")
for T in [0.80,0.85,0.90,0.95]:
    tp=sum(1 for r in allr if r["holdPct"]>=T and r["isStretch"])
    fp=sum(1 for r in allr if r["holdPct"]>=T and not r["isStretch"])
    print(f"pct>={T:<6.2f}{tp:>4}{fp:>5}{len(S)-tp:>4}{tp/max(1,tp+fp):>7.2f}{tp/max(1,len(S)):>8.2f}")
