import { Check, FileVideo } from 'lucide-react'
import { CaptionLine } from '@/components/captions/CaptionLine'
import { cn } from '@/lib/utils'
import { GROW_X, GROW_Y, POP, RISE, stagger } from './reveal-classes'
import { SAMPLE_CAPTIONS } from './sample-captions'
import { VideoFrame } from './VideoFrame'
import { STILL_FOOTAGE } from './video-shapes'

/*
 * Small product-like surfaces for the "How it works" cards. Each one plays its own small
 * entrance off the card's scroll reveal (reveal-classes.ts): the upload bar fills, chips pop,
 * signal bars grow, log steps tick in.
 *
 * All data is the landing demo clip's hand-written sample (sample-captions.ts) — illustrative,
 * not pipeline output.
 */

const SURFACE = 'rounded-xl border border-hairline bg-background/60 p-4'

/** 01 — the upload: file row, frame meta, finished progress bar. */
export function UploadSurface() {
  return (
    <div className={cn(SURFACE, 'flex flex-col gap-4')}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-surface-raised text-muted-foreground">
          <FileVideo className="size-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">reel_bekaar_captions.mp4</p>
          <p className="font-mono text-xs text-faint">00:08 · 9:16 · 540×960</p>
        </div>
        <Check className={cn('size-4 text-success', POP)} strokeWidth={2} style={stagger(0, 0, 1200)} />
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
        <div className={cn('h-full w-full rounded-full bg-signal', GROW_X)} style={stagger(0, 0, 250)} />
      </div>
    </div>
  )
}

/** 02 — Hinglish transcript in Roman script, every word with its start time. */
export function TranscriptSurface() {
  return (
    <ul className={cn(SURFACE, 'flex flex-wrap gap-1.5')}>
      {SAMPLE_CAPTIONS.slice(0, 10).map((word, index) => (
        <li
          key={`${word.word}-${word.startTime}`}
          className={cn('flex items-baseline gap-1.5 rounded-md border border-hairline bg-surface px-2 py-1', POP)}
          style={stagger(index, 55, 250)}
        >
          <span className="font-mono text-[11px] text-precision">{word.startTime.toFixed(2)}</span>
          <span className="text-sm text-foreground">{word.word}</span>
        </li>
      ))}
    </ul>
  )
}

/** Illustrative per-word signals, 0–1, relative to this speaker (as prosody.py measures). */
const SIGNALS = [
  { word: 'captions', loud: 0.45, pitch: 0.5, length: 0.4, tag: null },
  { word: 'bekaar', loud: 0.95, pitch: 0.8, length: 0.5, tag: 'angry' },
  { word: 'sunta', loud: 0.85, pitch: 0.65, length: 0.45, tag: 'loud' },
  { word: 'hai', loud: 0.35, pitch: 0.4, length: 0.25, tag: null },
  { word: 'hello', loud: 0.55, pitch: 0.6, length: 1, tag: 'held' },
] as const

const METRICS = [
  { key: 'loud', label: 'L' },
  { key: 'pitch', label: 'P' },
  { key: 'length', label: 'D' },
] as const

/** 03 — loudness / pitch / duration per word, as signal bars. Tagged words light up. */
export function SignalsSurface() {
  return (
    <div className={SURFACE}>
      <div className="grid grid-cols-5 gap-2">
        {SIGNALS.map((item, wordIndex) => (
          <div key={item.word} className="flex flex-col items-center gap-2">
            <div className="flex h-20 items-end gap-1">
              {METRICS.map((metric, metricIndex) => (
                <span
                  key={metric.key}
                  title={metric.label}
                  className={cn('w-1.5 rounded-full', item.tag ? 'bg-signal' : 'bg-hairline-strong', GROW_Y)}
                  style={{
                    height: `${Math.max(item[metric.key], 0.12) * 100}%`,
                    ...stagger(wordIndex * 3 + metricIndex, 45, 250),
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-foreground">{item.word}</span>
            <span
              className={cn('font-mono text-[10px] uppercase', item.tag ? 'text-signal' : 'text-faint', RISE)}
              style={stagger(wordIndex, 60, 900)}
            >
              {item.tag ?? '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-faint">L loudness · P pitch · D duration</p>
    </div>
  )
}

/** 04 — the styled result: angry, emphasis and a held word on one still frame. */
export function CaptionsSurface() {
  return (
    <VideoFrame shape="landscape" className="aspect-[2/1] w-full rounded-xl">
      <div className="absolute inset-0" style={STILL_FOOTAGE} />
      <div className={cn('absolute inset-x-0 bottom-[16%]', RISE)} style={stagger(0, 0, 300)}>
        <CaptionLine
          presetId="hinglish-bold"
          scale={1.3}
          words={[
            { text: 'ekdum', emotion: 'angry' },
            { text: 'bekaar', emotion: 'angry' },
            { text: 'the' },
            { text: 'hello', emotion: 'excited', stretched: 'hellooo' },
          ]}
        />
      </div>
    </VideoFrame>
  )
}

/** 05 — a voice command and the steps the editor logs while applying it. */
export function VoiceSurface() {
  const steps = ['Found “bekaar” at 00:02', 'Emotion → angry', 'Preview updated']

  return (
    <div className={cn(SURFACE, 'flex flex-col gap-3')}>
      <p
        className={cn(
          'self-start rounded-full border border-precision/30 bg-precision-dim px-3 py-1 font-mono text-[13px] text-precision',
          POP,
        )}
        style={stagger(0, 0, 250)}
      >
        “bekaar ko angry bana do”
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={step}
            className={cn('flex items-center gap-2 font-mono text-[13px] text-muted-foreground', RISE)}
            style={stagger(index, 220, 600)}
          >
            <Check className="size-3.5 text-success" strokeWidth={2} />
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
