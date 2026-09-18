"""THE PROPOSED PIPELINE: Transcribe -> Bedrock restores expressive spelling ->
forced alignment VERIFIES each guess against the audio -> budgeted scoring."""
import json,re,time
from pathlib import Path
import torch,torchaudio,numpy as np,soundfile as sf
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
OUT=Path(__file__).resolve().parent/"out"
bundle=torchaudio.pipelines.MMS_FA; model=bundle.get_model(with_star=False); DICT=bundle.get_dict(star=None)
def collapse(w): return re.sub(r"(.)\1+","\\1",re.sub(r"[^a-z]","",w.lower()))
def syl(w):
    c=collapse(w); return max(1,len(re.findall(r"[aeiou]+",c))) if c else 1
def align_words(clip,words):
    a,sr=sf.read(str(ROOT/"audio"/f"{clip}.wav"),dtype="float32"); wav=torch.from_numpy(a).unsqueeze(0)
    toks=[[DICT[c] for c in re.sub(r"[^a-z']","",w.lower()) if c in DICT] for w in words]
    keep=[i for i,t in enumerate(toks) if t]; tk=[toks[i] for i in keep]; kw=[words[i] for i in keep]
    with torch.inference_mode(): em,_=model(wav)
    ali,sc=torchaudio.functional.forced_align(em,torch.tensor([[i for t in tk for i in t]],dtype=torch.int32),blank=0)
    spans=torchaudio.functional.merge_tokens(ali[0],sc[0].exp()); ratio=wav.size(1)/em.size(1)/sr
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

rows=[]
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    tg=json.loads((OUT/f"tagged.{clip}.json").read_text())
    llm=[w for L in tg["lines"] for w in L["words"]]
    words=[w["text"] for w in llm]
    fa=align_words(clip,words)
    # map aligned spans back onto the LLM words (same order, minus dropped tokens)
    byi={}; k=0
    for w in llm:
        if k<len(fa) and collapse(fa[k]["text"])==collapse(w["text"]):
            byi[id(w)]=fa[k]; k+=1
    vps=np.array([ (byi[id(w)]["endMs"]-byi[id(w)]["startMs"])/syl(w["text"]) for w in llm if id(w) in byi])
    tw=truthmeta(clip)
    seq=[w for w in llm if id(w) in byi]
    for ri,hi in lev([collapse(x[0]) for x in tw],[collapse(w["text"]) for w in seq]):
        if hi is None: continue
        w=seq[hi]; f=byi[id(w)]
        v=(f["endMs"]-f["startMs"])/syl(w["text"])
        rows.append({"clip":clip,"llm":w["text"],"truth":tw[ri][0] if ri is not None else "—",
            "llmStretch":bool(re.search(r"(.)\1{2,}",w["text"].lower())),
            "isStretch":bool(ri is not None and tw[ri][1]),
            "durMs":f["endMs"]-f["startMs"],"vps":v,"holdPct":float((vps<v).mean())})

print("LLM-guessed stretches, VERIFIED against forced-aligned duration:")
print(f"{'clip':<12}{'llm':<12}{'truth':<13}{'真':<3}{'durMs':>7}{'ms/syl':>8}{'holdPct':>9}  verdict")
print("-"*80)
for r in rows:
    if r["llmStretch"] or r["isStretch"]:
        keep = r["holdPct"]>=0.75
        v = "KEEP stretch" if keep else "drop -> flat"
        ok = "TP" if (keep and r["isStretch"]) else "FP" if keep else ("FN" if r["isStretch"] else "TN")
        print(f"{r['clip'][:11]:<12}{r['llm'][:11]:<12}{r['truth'][:12]:<13}"
              f"{'Y' if r['isStretch'] else '.':<3}{r['durMs']:>7}{r['vps']:>8.0f}{r['holdPct']:>9.2f}  {v} [{ok}]")

S=[r for r in rows if r["isStretch"]]
print(f"\n--- LLM alone (any repeated letter) ---")
tp=sum(1 for r in rows if r["llmStretch"] and r["isStretch"]); fp=sum(1 for r in rows if r["llmStretch"] and not r["isStretch"])
print(f"  tp={tp} fp={fp} fn={len(S)-tp}  precision={tp/max(1,tp+fp):.2f} recall={tp/max(1,len(S)):.2f}")
print(f"--- LLM guess AND alignment agrees (holdPct>=0.75) ---")
tp=sum(1 for r in rows if r["llmStretch"] and r["holdPct"]>=0.75 and r["isStretch"])
fp=sum(1 for r in rows if r["llmStretch"] and r["holdPct"]>=0.75 and not r["isStretch"])
print(f"  tp={tp} fp={fp} fn={len(S)-tp}  precision={tp/max(1,tp+fp):.2f} recall={tp/max(1,len(S)):.2f}")
