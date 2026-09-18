"""A/B: identical scoring, two timing sources. Does MMS_FA fix elongation detection?"""
import json,re
from pathlib import Path
import numpy as np, librosa, torch, torchaudio, soundfile as sf
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
P=Path(__file__).resolve().parent/"evidence"/"stage-outputs"
b=torchaudio.pipelines.MMS_FA; M=b.get_model(with_star=False); D=b.get_dict(star=None)
def collapse(w): return re.sub(r"(.)\1+",r"\1",re.sub(r"[^a-z]","",w.lower()))
def syl(w):
    c=collapse(w); return max(1,len(re.findall(r"[aeiou]+",c))) if c else 1
STOP=set("a an the is am are was were be of to in on at for with by from as and or but so if then that this these those i you he she it we they me him her us them my your his its our their ka ki ke ko se me mein par pe hi bhi to na ni nahi hai hain ho hu hoon hun tha thi wo ye yeh voh jo kya kyu kyon ab ek do re haan just should would could can will do does did have has had".split())
def fa(clip,words):
    a,sr=sf.read(str(ROOT/"audio"/f"{clip}.wav"),dtype="float32"); w=torch.from_numpy(a).unsqueeze(0)
    tk=[[D[c] for c in re.sub(r"[^a-z']","",x.lower()) if c in D] for x in words]
    keep=[i for i,t in enumerate(tk) if t]; T=[tk[i] for i in keep]
    with torch.inference_mode(): em,_=M(w)
    al,sc=torchaudio.functional.forced_align(em,torch.tensor([[i for t in T for i in t]],dtype=torch.int32),blank=0)
    sp=torchaudio.functional.merge_tokens(al[0],sc[0].exp()); r=w.size(1)/em.size(1)/sr
    out={}; k=0
    for oi,t in zip(keep,T):
        s=sp[k:k+len(t)];k+=len(t)
        if s: out[oi]={"startMs":int(s[0].start*r*1000),"endMs":int(s[-1].end*r*1000)}
    return out
def voiced_ms(clip,spans):
    y,sr=librosa.load(str(ROOT/"audio"/f"{clip}.wav"),sr=16000,mono=True)
    f0,vf,_=librosa.pyin(y,fmin=70,fmax=400,sr=sr,hop_length=160,frame_length=1024)
    return [10*int(np.sum(vf[int(s/10):max(int(s/10)+1,int(e/10))]==True)) for s,e in spans]
def score(words,vms):
    vps=np.array([v/syl(w) for w,v in zip(words,vms)],dtype=float)
    out=[]
    for i,w in enumerate(words):
        hp=float((vps<vps[i]).mean())
        el=(collapse(w) not in STOP) and len(collapse(w))>=3
        hold=round(min(4.0,1.0+2.2*(vps[i]-260)/200),1) if (el and hp>=0.85 and vps[i]>=260) else 1.0
        out.append((w,hold))
    return out
res={}
for src in ["snap","mms_fa"]:
    TP=FP=FN=0; detail={}
    for c in ["Angry","Normal","Excited_long_texts","Real_reel"]:
        pr=json.loads((P/c/"08_project.json").read_text())
        words=[w["text"] for w in pr["words"]]
        if src=="snap": spans=[(w["startMs"],w["endMs"]) for w in pr["words"]]
        else:
            A=fa(c,words); spans=[(A[i]["startMs"],A[i]["endMs"]) if i in A else (w["startMs"],w["endMs"])
                                  for i,w in enumerate(pr["words"])]
        got=[(w,h) for w,h in score(words,voiced_ms(c,spans)) if h>1.0]
        truth=[x.lower() for x in re.findall(r"[A-Za-z]+",(ROOT/"truth"/f"{c}.txt").read_text()) if re.search(r"(.)\1{2,}",x.lower())]
        tcol=[re.sub(r"(.)\1+",r"\1",t) for t in truth]
        tp=[g for g in got if re.sub(r"(.)\1+",r"\1",g[0].lower().strip('.,')) in tcol]
        TP+=len(tp); FP+=len(got)-len(tp); FN+=max(0,len(truth)-len(tp)); detail[c]=got
    res[src]=(TP,FP,FN,detail)
    print(f"\n### timing source = {src}")
    for c,g in detail.items(): print(f"   {c:<20} {g}")
    print(f"   tp={TP} fp={FP} fn={FN}  precision={TP/max(1,TP+FP):.2f} recall={TP/max(1,TP+FN):.2f}")
