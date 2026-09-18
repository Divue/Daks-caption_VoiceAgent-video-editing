"""First tests of app/pipeline (none existed; audit 11 caveat box). Pure functions only, no AWS."""
import numpy as np
import soundfile

from app.pipeline import align, prosody, tag


def signals(ratio=1.0, extra=0, loud=0.0, pitch=0.0):
    return {"loudnessZ": loud, "pitchZ": pitch, "durationRatio": ratio, "extraMs": extra}


def test_stretch_never_rewrites_text():
    """INDEX.md invariant; audit 11 §5.3. Magnitude lives in `stretch`, text stays clean."""
    words = [{"text": "guys", "startMs": 0, "endMs": 900, "signals": signals(3.1, 590)},
             {"text": "STT", "startMs": 900, "endMs": 1800, "signals": signals(2.5, 400)}]
    out = tag.tag(words, use_llm=False)
    assert [w["text"] for w in out] == ["guys", "STT"]
    assert [w["stretch"] for w in out] == [3.1, 2.5]
    assert all(w["emotion"] == "excited" for w in out)


def test_stretch_needs_ratio_and_absolute_floor():
    fast = tag.tag([{"text": "track", "startMs": 0, "endMs": 400, "signals": signals(2.6, 200)}], use_llm=False)
    assert fast[0]["stretch"] == 1.0          # the Day 1 false positive: ratio passes, floor doesn't


def test_stretch_text_arithmetic_kept_for_renderer():
    # round(590/120)=5 extra letters -> 6 u's. The function's own docstring says "guuuuuys" (5): off by one.
    assert tag.stretch_text("guys", 590) == "guuuuuuys"


def test_align_gives_sarvam_text_transcribe_timings():
    timed = [{"text": "नमस्ते", "startMs": 100, "endMs": 400}, {"text": "दोस्तों", "startMs": 450, "endMs": 900}]
    out = align.align(["namaste", "doston"], timed)
    assert [(w["text"], w["startMs"], w["endMs"]) for w in out] == [("namaste", 100, 400), ("doston", 450, 900)]


def test_align_without_timings_is_zero_width():
    assert all(w["endMs"] == 0 for w in align.align(["a", "b"], []))


def test_prosody_survives_all_zero_width_words(tmp_path):
    """Sarvam text + empty Transcribe used to divide by zero (median rate 0)."""
    wav = tmp_path / "a.wav"
    sr = 16000
    soundfile.write(wav, 0.1 * np.sin(np.linspace(0, 2000 * np.pi, sr)), sr)
    out = prosody.analyze(str(wav), [{"text": "a", "startMs": 0, "endMs": 0}, {"text": "b", "startMs": 0, "endMs": 0}])
    assert len(out) == 2 and all("signals" in w for w in out)
