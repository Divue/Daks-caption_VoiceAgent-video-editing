"""Compare a Project produced by the API against ground truth and the eval harness's own output.

    python services/api/scripts/eval_project.py Angry project.json

Reports content-WER vs truth/ (the harness's exact metric, imported from caption_eval/evidence/wer.py),
the same for the harness's 08_project.json, and start/end-time deltas on words both outputs share.
Only text and timings are comparable: the harness's Project has a different shape (lines[],
integer emphasis, ids from w0, other signals keys).
"""
from __future__ import annotations

import difflib
import json
import re
import statistics
import sys
from pathlib import Path

BAKEOFF = Path(__file__).resolve().parent / "stt_bakeoff"


def _load_metric():
    """wer.py runs its report at import; exec only its definitions."""
    src = (BAKEOFF / "caption_eval/evidence/wer.py").read_text()
    ns: dict = {}
    exec(src.split("def load_engine")[0], ns)  # noqa: S102 — our own file, definitions only
    return ns["tokens"], ns["wer"]


def main(clip: str, project_path: str) -> None:
    tokens, wer = _load_metric()
    truth = (BAKEOFF / "truth" / f"{clip}.txt").read_text()
    ref = tokens(truth, collapse=True, canon=True)
    ours = json.loads(Path(project_path).read_text())
    harness = json.loads((BAKEOFF / f"caption_eval/evidence/stage-outputs/{clip}/08_project.json").read_text())

    def text_of(p):
        return " ".join(w["text"] for w in p["words"])

    for name, p in (("api (app/pipeline)", ours), ("harness 08_project", harness)):
        hyp = tokens(text_of(p), collapse=True, canon=True)
        print(f"{name:<20} words={len(p['words']):>3}  contentWER={wer(ref, hyp):.3f}")

    key = lambda w: re.sub(r"(.)\1+", r"\1", re.sub(r"[^a-z]", "", w["text"].lower()))
    a, b = [key(w) for w in ours["words"]], [key(w) for w in harness["words"]]
    starts, ends = [], []
    for block in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            wa, wb = ours["words"][block.a + k], harness["words"][block.b + k]
            starts.append(wa["startMs"] - wb["startMs"])
            ends.append(wa["endMs"] - wb["endMs"])
    if starts:
        abs_s = [abs(x) for x in starts]
        print(f"shared words={len(starts)}  start delta median={statistics.median(starts):+.0f}ms "
              f"|median|={statistics.median(abs_s):.0f}ms  max|={max(abs_s)}ms  "
              f"end delta median={statistics.median(ends):+.0f}ms")
        print(f"words >100ms apart at start: {sum(1 for x in abs_s if x > 100)}")
    short = [w["text"] for w in ours["words"] if w["endMs"] - w["startMs"] < 60]
    print(f"api words under 60ms: {len(short)} {short[:10]}")
    stretched = [(w["text"], w["stretch"]) for w in ours["words"] if w["stretch"] > 1]
    print(f"api stretched: {stretched}   emphasis: {sum(w['emphasis'] for w in ours['words'])}   "
          f"angry: {sum(w['emotion'] == 'angry' for w in ours['words'])}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
