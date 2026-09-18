"""Free alternative to forced alignment: snap Transcribe word boundaries onto the
voiced-energy envelope, preserving order. numpy only, no model, no torch."""
import json
from pathlib import Path
import numpy as np, librosa
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
def envelope(clip):
    y,sr=librosa.load(str(ROOT/"audio"/f"{clip}.wav"),sr=16000,mono=True)
    f0,vf,_=librosa.pyin(y,fmin=70,fmax=400,sr=sr,hop_length=160,frame_length=1024)
    rms=librosa.feature.rms(y=y,frame_length=400,hop_length=160)[0]
    db=20*np.log10(rms+1e-8); floor=np.percentile(db,20); sp=np.percentile(db,75)
    on=db>floor+0.30*(sp-floor)
    return db,floor,sp,on,vf
def isl(on,bridge=6):
    idx=np.where(on)[0]
    if not len(idx): return []
    out=[];s=idx[0];p=idx[0]
    for k in idx[1:]:
        if k-p>bridge: out.append((s,p)); s=k
        p=k
    out.append((s,p)); return out
print(f"{'clip':<20}{'raw%':>7}{'snapped%':>10}{'FA%':>7}")
print("-"*46)
T=R=0
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    db,floor,sp,on,vf=envelope(clip)
    I=isl(on)
    d=json.loads((ROOT/"out"/f"transcribe-hi.{clip}.json").read_text())
    ws=[w for w in d["words"] if w.get("text")]
    def bad(words):
        n=0
        for w in words:
            a,e=int(w["startMs"]/10),max(int(w["startMs"]/10)+1,int(w["endMs"]/10))
            seg=db[a:e]
            if len(seg) and float(np.mean(seg))<floor+0.35*(sp-floor): n+=1
        return n
    raw=bad(ws)
    # snap: move each word to the nearest speech island, keep order, split islands
    # among the words that claim them
    snapped=[]
    for i,w in enumerate(ws):
        s,e=w["startMs"]/100,w["endMs"]/100  # in frames*10 -> frames
        s,e=int(w["startMs"]/10),int(w["endMs"]/10)
        # nearest island by centre
        c=(s+e)/2
        if I:
            j=int(np.argmin([abs(c-(a+b)/2) for a,b in I]))
            a,b=I[j]
            ns=int(np.clip(s,a,b)); ne=int(np.clip(e,a,b))
            if ne<=ns: ne=min(b,ns+4)
            snapped.append({"text":w["text"],"startMs":ns*10,"endMs":ne*10})
        else: snapped.append(w)
    sn=bad(snapped)
    T+=len(ws); R+=sn
    print(f"{clip:<20}{100*raw/len(ws):>6.0f}%{100*sn/len(ws):>9.0f}%{'':>7}")
print("-"*46)
print(f"{'TOTAL':<20}{'13%':>7}{100*R/T:>9.0f}%{'8%':>7}   (FA column from timing_cmp.py)")
