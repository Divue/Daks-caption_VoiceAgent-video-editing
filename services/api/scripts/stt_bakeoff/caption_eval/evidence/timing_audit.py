"""How trustworthy are Transcribe hi-IN word timestamps? A word whose stated
interval sits at the noise floor is mistimed, full stop."""
import json
from pathlib import Path
import numpy as np, librosa
ROOT = Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
print(f"{'clip':<20}{'words':>6}{'inSilence':>11}{'<50ms':>7}{'medDur':>8}{'%bad':>7}")
print("-"*60)
tot=bad=0
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    y,sr = librosa.load(str(ROOT/"audio"/f"{clip}.wav"), sr=16000, mono=True)
    rms = librosa.feature.rms(y=y, frame_length=400, hop_length=160)[0]
    db = 20*np.log10(rms+1e-8); floor=np.percentile(db,20); speech=np.percentile(db,75)
    d=json.loads((ROOT/"out"/f"transcribe-hi.{clip}.json").read_text())
    ws=[w for w in d["words"] if w.get("text")]
    sil=0; tiny=0; durs=[]
    for w in ws:
        a,b=int(w["startMs"]/10), max(int(w["startMs"]/10)+1,int(w["endMs"]/10))
        seg=db[a:b]
        m=float(np.mean(seg)) if len(seg) else floor
        # "in silence" = closer to the noise floor than to the speech level
        if m < floor + 0.35*(speech-floor): sil+=1
        if w["endMs"]-w["startMs"] < 50: tiny+=1
        durs.append(w["endMs"]-w["startMs"])
    tot+=len(ws); bad+=sil
    print(f"{clip:<20}{len(ws):>6}{sil:>11}{tiny:>7}{int(np.median(durs)):>8}{100*sil/len(ws):>6.0f}%")
print("-"*60)
print(f"{'TOTAL':<20}{tot:>6}{bad:>11}{'':>7}{'':>8}{100*bad/tot:>6.0f}%")
