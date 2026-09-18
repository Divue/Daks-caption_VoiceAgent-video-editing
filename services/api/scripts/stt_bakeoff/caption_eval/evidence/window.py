import sys
from pathlib import Path
import numpy as np, librosa
ROOT = Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
clip, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
y, sr = librosa.load(str(ROOT/"audio"/f"{clip}.wav"), sr=16000, mono=True)
hop=160
f0,vf,vp = librosa.pyin(y,fmin=70,fmax=400,sr=sr,hop_length=hop,frame_length=1024)
rms = librosa.feature.rms(y=y,frame_length=400,hop_length=hop)[0]
db = 20*np.log10(rms+1e-8); floor=np.percentile(db,20)
a,b=int(t0*100),int(t1*100)
print(f"{clip} {t0}-{t1}s  (floor {floor:.0f}dB)  '#'=energy, V=voiced, f0")
for i in range(a,b,2):
    bar = "#"*max(0,int((db[i]-floor)/2.0))
    v = "V" if (i<len(vf) and vf[i]) else "."
    p = f"{f0[i]:5.0f}" if i<len(f0) and f0[i]==f0[i] else "    -"
    print(f"{i/100:6.2f} {v} {p} {bar}")
