"""Does MMS_FA actually beat Transcribe on ORDINARY word timing, not just held words?
Metric: fraction of words whose stated interval sits at the noise floor (= mistimed),
plus fraction of the word's span that is actually voiced."""
import json,re
from pathlib import Path
import numpy as np, librosa, torch, torchaudio, soundfile as sf
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
b=torchaudio.pipelines.MMS_FA; m=b.get_model(with_star=False); D=b.get_dict(star=None)
def fa(clip,words):
    a,sr=sf.read(str(ROOT/"audio"/f"{clip}.wav"),dtype="float32"); w=torch.from_numpy(a).unsqueeze(0)
    tk=[[D[c] for c in re.sub(r"[^a-z']","",x.lower()) if c in D] for x in words]
    keep=[i for i,t in enumerate(tk) if t]; T=[tk[i] for i in keep]; W=[words[i] for i in keep]
    with torch.inference_mode(): em,_=m(w)
    al,sc=torchaudio.functional.forced_align(em,torch.tensor([[i for t in T for i in t]],dtype=torch.int32),blank=0)
    sp=torchaudio.functional.merge_tokens(al[0],sc[0].exp()); r=w.size(1)/em.size(1)/sr
    o=[];k=0
    for x,t in zip(W,T):
        s=sp[k:k+len(t)];k+=len(t)
        if s: o.append({"text":x,"startMs":int(s[0].start*r*1000),"endMs":int(s[-1].end*r*1000)})
    return o
def audit(clip,words,label):
    y,sr=librosa.load(str(ROOT/"audio"/f"{clip}.wav"),sr=16000,mono=True)
    f0,vf,_=librosa.pyin(y,fmin=70,fmax=400,sr=sr,hop_length=160,frame_length=1024)
    rms=librosa.feature.rms(y=y,frame_length=400,hop_length=160)[0]
    db=20*np.log10(rms+1e-8); floor=np.percentile(db,20); sp=np.percentile(db,75)
    sil=0; vfr=[]
    for w in words:
        a,e=int(w["startMs"]/10),max(int(w["startMs"]/10)+1,int(w["endMs"]/10))
        seg=db[a:e]; vv=vf[a:e]
        if len(seg) and float(np.mean(seg))<floor+0.35*(sp-floor): sil+=1
        if len(vv): vfr.append(float(np.mean(vv==True)))
    return len(words),sil,100*sil/max(1,len(words)),100*np.mean(vfr)
print(f"{'clip':<20}{'engine':<14}{'words':>6}{'mistimed':>10}{'%':>7}{'voiced%':>9}")
print("-"*68)
agg={}
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    d=json.loads((ROOT/"out"/f"transcribe-hi.{clip}.json").read_text())
    tw=[w for w in d["words"] if w.get("text")]
    n,s,p,v=audit(clip,tw,"transcribe"); agg.setdefault("transcribe-hi",[]).append((n,s,v))
    print(f"{clip:<20}{'transcribe-hi':<14}{n:>6}{s:>10}{p:>6.0f}%{v:>8.0f}%")
    al=fa(clip,[w["text"] for w in tw])
    n2,s2,p2,v2=audit(clip,al,"fa"); agg.setdefault("MMS_FA",[]).append((n2,s2,v2))
    print(f"{'':<20}{'MMS_FA':<14}{n2:>6}{s2:>10}{p2:>6.0f}%{v2:>8.0f}%")
print("-"*68)
for k,v in agg.items():
    N=sum(x[0] for x in v); S=sum(x[1] for x in v); V=np.mean([x[2] for x in v])
    print(f"{'TOTAL':<20}{k:<14}{N:>6}{S:>10}{100*S/N:>6.0f}%{V:>8.0f}%")
