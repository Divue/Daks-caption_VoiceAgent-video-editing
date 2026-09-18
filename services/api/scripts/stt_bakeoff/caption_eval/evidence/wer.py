"""WER harness for Hinglish captions. Reports strict + content-normalized WER."""
import json, re, sys, unicodedata
from pathlib import Path

ROOT = Path("/home/shubh/Documents/FirstCommit/services/api/scripts/stt_bakeoff")
CLIPS = ["Normal", "Excited_long_texts", "Angry", "Real_reel"]

# Hinglish spelling variants that mean the same word to a caption reader.
# Maps many surface forms -> one canonical token.
VARIANTS = {
    "nahi": ["nahi","nai","ni","nahin","nhi"],
    "hai": ["hai","hain","h","hei","he"],
    "hoon": ["hoon","hun","hu","hoo"],
    "hum": ["hum","ham","hm"],
    "log": ["log","logo","logon","lok"],
    "humlog": ["humlog","hamlog","tumlog","tumlogon"],
    "kaam": ["kaam","kam","kaamm"],
    "kyun": ["kyun","kyu","kyon","q"],
    "mooh": ["mooh","munh","muh","mou"],
    "khwaab": ["khwaab","khab","khaab","khwab"],
    "chaalu": ["chaalu","chalu"],
    "ghatiya": ["ghatiya","khatiya","gatiya"],
    "roi": ["roi","royi","roee"],
    "baari": ["baari","bhari","bari"],
    "behenchod": ["behenchod","bahanchod","benchod","behnchod"],
    "aayenge": ["aayenge","ayenge"],
    "taare": ["taare","tare","chaand","chand"],
    "uh": ["uh","ah","aa","aaa","umm","um","er"],
    "im": ["im","iam"],
    "hows": ["hows","howz","howis"],
}
CANON = {}
for k, vs in VARIANTS.items():
    for v in vs:
        CANON[v] = k

def strip_punct(s):
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("’", "'").replace("‘", "'").replace("“",'"').replace("”",'"')
    s = re.sub(r"[^\w\s']", " ", s)
    return s

def tokens(text, collapse=False, canon=False):
    t = strip_punct(text.lower())
    t = t.replace("'", "")
    toks = t.split()
    out = []
    for w in toks:
        if collapse:
            # collapse any letter repeated 2+ times down to 1 -> kills elongation spelling
            w = re.sub(r"(.)\1+", r"\1", w)
        if canon:
            w = CANON.get(w, w)
        if w:
            out.append(w)
    return out

def levenshtein(a, b):
    m, n = len(a), len(b)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0]*n
        for j in range(1, n + 1):
            cur[j] = min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] != b[j-1]))
        prev = cur
    return prev[n]

def wer(ref, hyp):
    if not ref: return float("nan")
    return levenshtein(ref, hyp) / len(ref)

def load_engine(engine, clip):
    p = ROOT / "out" / f"{engine}.{clip}.json"
    if not p.exists(): return None
    return json.loads(p.read_text())

ENGINES = ["transcribe-hi", "transcribe-en", "sarvam"]

print(f"{'clip':<20} {'engine':<15} {'strictWER':>10} {'contentWER':>11} {'refN':>5} {'hypN':>5}")
print("-" * 72)
summary = {}
for clip in CLIPS:
    truth = (ROOT / "truth" / f"{clip}.txt").read_text()
    for eng in ENGINES:
        d = load_engine(eng, clip)
        if d is None: continue
        hyp_text = d.get("text", "")
        ref_s = tokens(truth); hyp_s = tokens(hyp_text)
        ref_c = tokens(truth, collapse=True, canon=True)
        hyp_c = tokens(hyp_text, collapse=True, canon=True)
        w_s = wer(ref_s, hyp_s); w_c = wer(ref_c, hyp_c)
        summary.setdefault(eng, []).append(w_c)
        print(f"{clip:<20} {eng:<15} {w_s:>10.3f} {w_c:>11.3f} {len(ref_s):>5} {len(hyp_s):>5}")
    print()

print("MEAN contentWER by engine (across 4 clips):")
for eng, vals in summary.items():
    print(f"  {eng:<15} {sum(vals)/len(vals):.3f}   per-clip: {[round(v,3) for v in vals]}")
