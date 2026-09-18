import { useCallback, useRef, useState } from "react";
import { smoothTowards } from "../lib/smoothing";

export type MicStatus = "idle" | "requesting" | "listening" | "denied" | "unsupported";

export interface AudioLevels {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

function restLevels(): AudioLevels {
  return { level: 0, bass: 0, mid: 0, treble: 0 };
}

export function useMicAnalyser() {
  const [status, setStatus] = useState<MicStatus>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levelsRef = useRef<AudioLevels>(restLevels());
  const lastSampleTimeRef = useRef<number>(performance.now());

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    freqDataRef.current = null;
    timeDataRef.current = null;
    levelsRef.current = restLevels();
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      if (ctx.state === "suspended") {
        // Some browsers keep the context suspended after the awaited getUserMedia()
        // call breaks the direct user-gesture chain — without this, the analyser
        // silently reports all-zero data and the sphere never appears to react.
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      streamRef.current = stream;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);
      lastSampleTimeRef.current = performance.now();
      setStatus("listening");
    } catch {
      setStatus("denied");
    }
  }, []);

  /** Pull the latest smoothed audio metrics. Safe to call every animation frame. */
  const sample = useCallback((): AudioLevels => {
    const now = performance.now();
    const dt = Math.min((now - lastSampleTimeRef.current) / 1000, 0.1);
    lastSampleTimeRef.current = now;

    const lv = levelsRef.current;
    const analyser = analyserRef.current;
    const freqData = freqDataRef.current;
    const timeData = timeDataRef.current;

    if (!analyser || !freqData || !timeData) {
      lv.level = smoothTowards(lv.level, 0, dt, 0.1, 0.4);
      lv.bass = smoothTowards(lv.bass, 0, dt, 0.1, 0.4);
      lv.mid = smoothTowards(lv.mid, 0, dt, 0.1, 0.4);
      lv.treble = smoothTowards(lv.treble, 0, dt, 0.1, 0.4);
      return lv;
    }

    analyser.getByteTimeDomainData(timeData);
    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);
    const targetLevel = Math.min(Math.pow(rms * 3.8, 0.7), 1);

    analyser.getByteFrequencyData(freqData);
    const sampleRate = audioCtxRef.current?.sampleRate ?? 48000;
    const binHz = sampleRate / analyser.fftSize;
    const bandAverage = (fromHz: number, toHz: number) => {
      const fromBin = Math.max(0, Math.floor(fromHz / binHz));
      const toBin = Math.min(freqData.length - 1, Math.ceil(toHz / binHz));
      let sum = 0;
      let count = 0;
      for (let i = fromBin; i <= toBin; i++) {
        sum += freqData[i];
        count++;
      }
      return count > 0 ? sum / count / 255 : 0;
    };

    const targetBass = Math.min(Math.pow(bandAverage(20, 250), 0.75), 1);
    const targetMid = Math.min(Math.pow(bandAverage(250, 2000), 0.75), 1);
    const targetTreble = Math.min(Math.pow(bandAverage(2000, 8000), 0.75), 1);

    lv.level = smoothTowards(lv.level, targetLevel, dt, 0.035, 0.3);
    lv.bass = smoothTowards(lv.bass, targetBass, dt, 0.05, 0.32);
    lv.mid = smoothTowards(lv.mid, targetMid, dt, 0.05, 0.28);
    lv.treble = smoothTowards(lv.treble, targetTreble, dt, 0.04, 0.25);
    return lv;
  }, []);

  return { status, start, stop, sample };
}
