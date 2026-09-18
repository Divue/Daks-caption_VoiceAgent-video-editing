import json, sys, time
from pathlib import Path
from faster_whisper import WhisperModel
ROOT = Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
OUT  = Path(__file__).resolve().parent/"out"
OUT.mkdir(exist_ok=True)
size, lang = sys.argv[1], sys.argv[2]
prompt = ("Hinglish captions in Roman script: bhai, nahi, kya, yaar, matlab, "
          "kaam, log, hota, birthday, testing.") if lang=="en" else None
m = WhisperModel(size, device="cpu", compute_type="int8")
for clip in ["Normal","Excited_long_texts","Angry","Real_reel"]:
    t=time.time()
    segs, info = m.transcribe(str(ROOT/"audio"/f"{clip}.wav"), language=lang,
                              word_timestamps=True, beam_size=5,
                              initial_prompt=prompt, condition_on_previous_text=False)
    words=[]; text=[]
    for s in segs:
        text.append(s.text)
        for w in (s.words or []):
            words.append({"text": w.word.strip(), "startMs": int(w.start*1000),
                          "endMs": int(w.end*1000), "prob": round(w.probability,3)})
    el=time.time()-t
    d={"text":"".join(text).strip(),"words":words,"elapsedS":round(el,1),
       "engine":f"whisper-{size}-{lang}","clip":clip}
    (OUT/f"whisper-{size}-{lang}.{clip}.json").write_text(json.dumps(d,indent=1,ensure_ascii=False))
    print(f"[{size}/{lang}] {clip:<20} {el:5.1f}s  {len(words):>3}w  {d['text'][:95]}")
