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


def words(texts, loud=None, gaps=None):
    out, t = [], 0
    for i, text in enumerate(texts):
        gap = (gaps or [0] * len(texts))[i]
        t += gap
        out.append({"text": text, "startMs": t, "endMs": t + 300,
                    "signals": signals(loud=(loud or [0.0] * len(texts))[i])})
        t += 300
    return out


def test_emphasis_is_a_budget_not_a_threshold():
    """Old z-score thresholds gave 28% on Angry; the harness's rule lands near 15%."""
    loud = [i / 100 for i in range(100)]           # every word louder than the last
    out = tag.tag(words([f"word{i}" for i in range(100)], loud=loud), use_llm=False)
    assert 10 <= sum(w["emphasis"] for w in out) <= 16
    assert out[-1]["emphasis"] and not out[0]["emphasis"]


def test_function_words_need_to_be_louder():
    """The loudest word in the clip is skipped when it is "the" - the fix for audit 11 §5.2,
    where emphasis landed on "should/just/the" instead of "fuck/shit"."""
    texts = ["the"] + [f"word{i}" for i in range(19)]
    loud = [1.9] + [i / 10 for i in range(19)]
    out = tag.tag(words(texts, loud=loud), use_llm=False)
    assert out[0]["emphasis"] is False and sum(w["emphasis"] for w in out) == 3
    content = tag.tag(words(["fuck"] + texts[1:], loud=loud), use_llm=False)
    assert content[0]["emphasis"] is True


def test_pause_before_a_word_counts():
    plain = tag.emphasis_scores(words(["alpha", "bravo"], gaps=[0, 0]))
    paused = tag.emphasis_scores(words(["alpha", "bravo"], gaps=[0, 600]))
    assert paused[1] > plain[1]


def test_line_tone_becomes_per_word_emotion(monkeypatch):
    from app.pipeline import semantics
    monkeypatch.setattr(semantics, "analyze",
                        lambda w, **k: semantics.Semantics(tones=["anger", "anger", "neutral", "hype"]))
    out = tag.tag(words(["fuck", "this", "ok", "wow"]), use_llm=True)
    assert [w["emotion"] for w in out] == ["angry", "angry", "neutral", "excited"]


def test_llm_held_flag_never_sets_stretch(monkeypatch):
    """Measured: the held flag alone gave 0 true positives and was unstable across prompts."""
    from app.pipeline import semantics
    monkeypatch.setattr(semantics, "analyze",
                        lambda w, **k: semantics.Semantics(tones=["neutral"] * 2, held={0, 1}))
    out = tag.tag([{"text": "guys", "startMs": 0, "endMs": 900, "signals": signals(3.1, 590)},
                   {"text": "ok", "startMs": 900, "endMs": 1000, "signals": signals(1.0, 0)}], use_llm=True)
    assert [w["stretch"] for w in out] == [3.1, 1.0]       # numeric test decides, not the flag


def test_semantics_repairs_bad_line_ranges():
    from app.pipeline import semantics
    tones, lines = semantics._apply_lines(
        [{"startIndex": 0, "endIndex": 1, "tone": "anger"},
         {"startIndex": 1, "endIndex": 2, "tone": "hype"},        # overlaps: 1 already taken
         {"startIndex": 5, "endIndex": 9, "tone": "anger"},       # out of range
         {"startIndex": 3, "endIndex": 3, "tone": "sarcastic"}],  # unknown tone
        4)
    assert tones == ["anger", "anger", "hype", "neutral"]
    assert [l["tone"] for l in lines] == ["anger", "hype"]


def test_semantics_all_neutral_when_bedrock_is_unusable(monkeypatch):
    from app.pipeline import semantics
    # Patched at the factory semantics actually calls. It used to import boto3 itself; since the
    # temporary credential shim (app/aws_fallback.py) it builds its client through
    # aws_fallback.client, so patching semantics.boto3 raised AttributeError before the test ran.
    monkeypatch.setattr(semantics.aws_fallback, "client", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no creds")))
    sem = semantics.analyze([{"text": "a", "startMs": 0, "endMs": 1}])
    assert sem.tones == ["neutral"] and sem.ok is False
