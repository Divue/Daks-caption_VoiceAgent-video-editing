"""Sarvam Saaras v3 across every documented mode. Two questions:
(1) does any mode preserve elongated spelling? (2) does any mode give WORD timestamps?"""
import json, os, sys, time
from pathlib import Path
import requests
ROOT=Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
OUT=Path(__file__).resolve().parent/"out"; OUT.mkdir(exist_ok=True)
KEY=os.environ["SARVAM_API_KEY"]
MODES=["transcribe","verbatim","translit","codemix","translate"]
CLIPS=["Excited_long_texts","Angry","Normal","Real_reel"]
for clip in CLIPS:
    wav=ROOT/"audio"/f"{clip}.wav"
    print(f"\n{'='*100}\n{clip}\n{'='*100}")
    for mode in MODES:
        try:
            t=time.time()
            r=requests.post("https://api.sarvam.ai/speech-to-text",
                headers={"api-subscription-key":KEY},
                data={"model":"saaras:v3","mode":mode,"with_timestamps":"true"},
                files={"file":(wav.name,wav.open("rb"),"audio/wav")},timeout=300)
            el=time.time()-t
            if r.status_code!=200:
                print(f"  {mode:<11} HTTP {r.status_code}: {r.text[:110]}"); continue
            raw=r.json()
            ts=(raw.get("timestamps") or {})
            w=ts.get("words") or []
            # is it word-level or one big chunk?
            kind=("WORD-level" if len(w)>5 else f"chunk-level({len(w)})")
            (OUT/f"sarvam-{mode}.{clip}.json").write_text(json.dumps(raw,ensure_ascii=False,indent=1))
            print(f"  {mode:<11} {el:5.1f}s  ts={kind:<16} {raw.get('transcript','')[:90]}")
        except Exception as e:
            print(f"  {mode:<11} ERR {type(e).__name__}: {e}")
