import { useState } from 'react'
import { CAPTION_FONTS, DEFAULT_GLOW_LAYERS, DEFAULT_STRETCH } from '@captions/shared'
import type { Emotion, EmotionStyle, Preset, Style, TextCase } from '@captions/shared'
import { EMOTION_DOT } from '@/lib/emotion'
import { renderedText, resolveEmotionLayer } from '@/lib/caption-style'
import { cn } from '@/lib/utils'
import type { PresetOverride } from '@/state/preset-override-context'
import { ColorField, Field, NumberField, SegmentedField, SelectField, Section, SessionOnlyBadge } from './fields'

/**
 * The preset-only half of the panel.
 *
 * Everything here is a CONDITIONAL layer — it applies to emphasised words, or to a tone run, or
 * to words the playhead has not reached, or to held words. `Style` is per word and has no way to
 * say "when emphasised", so none of it can be written onto the words and saved. It tunes the live
 * preview for this session, and every section says so rather than pretending otherwise. See
 * state/preset-override-context.tsx.
 */

const FONT_OPTIONS = CAPTION_FONTS.map((font) => ({ value: font, label: font }))

const WEIGHTS = [
  { value: '400', label: 'Regular' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra' },
  { value: '900', label: 'Black' },
] as const

const CASES: { value: TextCase; label: string; title: string }[] = [
  { value: 'none', label: 'Tt', title: 'As written' },
  { value: 'upper', label: 'TT', title: 'UPPERCASE' },
  { value: 'lower', label: 'tt', title: 'lowercase' },
]

interface PresetSectionProps {
  preset: Preset
  setOverride: (patch: PresetOverride) => void
}

/**
 * Emphasis is a full independent FACE, not a weight bump — family, size, case and fill all change
 * together. That is the single most load-bearing idea in all four rebuilt presets, so it gets its
 * own section rather than a checkbox in Text.
 */
export function EmphasisSection({ preset, setOverride }: PresetSectionProps) {
  const emphasis = preset.emphasis
  const family = emphasis.fontFamily ?? preset.base.fontFamily
  const weight = emphasis.weight ?? preset.base.weight
  const italic = emphasis.italic ?? preset.base.italic ?? false
  const textCase = emphasis.textCase ?? preset.base.textCase ?? 'none'
  const color = emphasis.color ?? preset.base.color
  const stops = emphasis.gradientStops
  const gradient = emphasis.gradient

  const patch = (change: Partial<Style>) => setOverride({ emphasis: { ...emphasis, ...change } })

  return (
    <Section
      title="Emphasis"
      badge={<SessionOnlyBadge />}
      hint="The face used for stressed words. Size is a multiple of the base, so changing the base size keeps the proportion."
    >
      <SelectField
        label="Font family"
        value={family}
        options={FONT_OPTIONS}
        onChange={(value) => patch({ fontFamily: value })}
      />
      <SegmentedField
        label="Weight"
        value={String(weight)}
        options={WEIGHTS}
        onChange={(value) => patch({ weight: Number(value) })}
      />
      <SegmentedField
        label="Face"
        value={italic ? 'italic' : 'upright'}
        options={[
          { value: 'upright', label: 'Regular' },
          { value: 'italic', label: 'Italic' },
        ]}
        onChange={(value) => patch({ italic: value === 'italic' })}
      />
      <NumberField
        label="Size"
        value={preset.emphasisScale}
        min={1}
        max={4}
        step={0.01}
        decimals={2}
        suffix="×"
        onChange={(value) => setOverride({ emphasisScale: value })}
      />
      <SegmentedField
        label="Case"
        value={textCase}
        options={CASES}
        onChange={(value) => patch({ textCase: value })}
      />

      <SegmentedField
        label="Fill"
        value={stops || gradient ? 'gradient' : 'solid'}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
        onChange={(value) => {
          if (value === 'solid') patch({ gradient: undefined, gradientStops: undefined, color })
          else if (!stops && !gradient) patch({ gradient: [color, '#000000'] })
        }}
      />

      {!stops && !gradient && (
        <ColorField label="Colour" value={color} onChange={(value) => patch({ color: value })} />
      )}

      {gradient && !stops && (
        <Field label="Gradient">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Emphasis gradient start"
              value={gradient[0]}
              onChange={(event) => patch({ gradient: [event.target.value, gradient[1]] })}
              className="h-8 flex-1 cursor-pointer rounded-md border border-border bg-transparent"
            />
            <input
              type="color"
              aria-label="Emphasis gradient end"
              value={gradient[1]}
              onChange={(event) => patch({ gradient: [gradient[0], event.target.value] })}
              className="h-8 flex-1 cursor-pointer rounded-md border border-border bg-transparent"
            />
          </div>
        </Field>
      )}

      {stops && (
        <Field label="Gradient">
          <div
            className="h-8 rounded-md border border-border"
            style={{
              backgroundImage: `linear-gradient(90deg, ${stops
                .map((stop) => `${stop.color} ${stop.at}%`)
                .join(', ')})`,
            }}
          />
          <p className="text-[10px] text-muted-foreground">
            {stops.length}-stop sheen. Switch to Solid to replace it.
          </p>
        </Field>
      )}

      <NumberField
        label="Glow radius"
        value={emphasis.glow ?? 0}
        min={0}
        max={160}
        suffix="px"
        onChange={(value) => patch({ glow: value })}
      />
      {(emphasis.glow ?? 0) > 0 && (
        <ColorField
          label="Glow colour"
          // A gradient fill is transparent, so the halo must carry its own colour or it vanishes.
          value={emphasis.glowColor ?? color}
          onChange={(value) => patch({ glowColor: value })}
        />
      )}
    </Section>
  )
}

/**
 * Per-emotion styling — the section the reference product has no counterpart for. Tone is the
 * whole reason this app exists, so it gets first-class controls rather than being buried in a
 * per-word override.
 */
export function SentimentSection({ preset, setOverride }: PresetSectionProps) {
  const [active, setActive] = useState<Exclude<Emotion, 'neutral'>>('angry')
  const layer = resolveEmotionLayer(preset, active) ?? { style: {} }

  const patch = (change: Partial<EmotionStyle>) => {
    const next: EmotionStyle = {
      style: { ...layer.style, ...change.style },
      scale: change.scale ?? layer.scale,
    }
    setOverride({ emotion: { ...preset.emotion, [active]: next } })
  }

  return (
    <Section
      title="Sentiment"
      badge={<SessionOnlyBadge />}
      hint="Neutral is the base look — edit it under Text. Angry and Excited layer on top of any preset."
    >
      <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-0.5">
        {(['angry', 'excited'] as const).map((emotion) => (
          <button
            key={emotion}
            type="button"
            aria-pressed={active === emotion}
            onClick={() => setActive(emotion)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-1 text-[11px] font-medium capitalize transition-colors',
              active === emotion
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('size-1.5 rounded-full', EMOTION_DOT[emotion])} />
            {emotion}
          </button>
        ))}
      </div>

      <ColorField
        label="Colour"
        value={layer.style.color ?? preset.base.color}
        onChange={(value) => patch({ style: { color: value } })}
      />
      <SegmentedField
        label="Weight"
        value={String(layer.style.weight ?? preset.base.weight)}
        options={WEIGHTS}
        onChange={(value) => patch({ style: { weight: Number(value) } })}
      />
      <SegmentedField
        label="Case"
        value={layer.style.textCase ?? preset.base.textCase ?? 'none'}
        options={CASES}
        onChange={(value) => patch({ style: { textCase: value } })}
      />
      <NumberField
        label="Shake"
        value={layer.style.shake ?? 0}
        min={0}
        max={20}
        suffix="px"
        onChange={(value) => patch({ style: { shake: value } })}
      />
      <NumberField
        label="Scale"
        value={layer.scale ?? 1}
        min={0.6}
        max={2}
        step={0.01}
        decimals={2}
        suffix="×"
        onChange={(value) => patch({ scale: value })}
      />
    </Section>
  )
}

/**
 * Stretch repeat sizing, with a live preview.
 *
 * These two numbers were hardcoded constants in caption-style.ts. They control how "bhai" becomes
 * "bhaiiii", which is a look decision, so they belong to the preset — and how far to push them is
 * impossible to judge without seeing a held word, hence the preview.
 */
export function StretchSection({
  preset,
  setOverride,
  sample,
}: PresetSectionProps & {
  /** A real held word from the project, so the preview shows this video's data, not a mock. */
  sample?: { text: string; extraMs: number }
}) {
  const tuning = preset.stretch ?? DEFAULT_STRETCH

  const preview = sample
    ? renderedText(
        {
          id: 'preview',
          text: sample.text,
          startMs: 0,
          endMs: 1,
          emphasis: false,
          emotion: 'neutral',
          stretch: 2,
          signals: { loudnessZ: 0, pitchZ: 0, durationRatio: 1, extraMs: sample.extraMs },
        },
        tuning,
      )
    : null

  return (
    <Section
      title="Stretch"
      badge={<SessionOnlyBadge />}
      hint="How a held word grows letters. The repeats are drawn; Word.text is never rewritten."
    >
      <NumberField
        label="Ms per repeat"
        value={tuning.msPerRepeat}
        min={40}
        max={400}
        step={10}
        suffix="ms"
        onChange={(value) => setOverride({ stretch: { ...tuning, msPerRepeat: value } })}
      />
      <NumberField
        label="Max repeats"
        value={tuning.maxRepeats}
        min={1}
        max={10}
        onChange={(value) => setOverride({ stretch: { ...tuning, maxRepeats: value } })}
      />

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        {preview ? (
          <>
            <p className="text-[10px] text-muted-foreground">
              &ldquo;{sample?.text}&rdquo; held {Math.round(sample?.extraMs ?? 0)}ms longer than expected
            </p>
            <p className="truncate text-sm font-semibold text-foreground">{preview}</p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No stretched word in this transcript yet — set a word&rsquo;s Stretch above 1 to preview.
          </p>
        )}
      </div>
    </Section>
  )
}

/** How words the playhead has not reached yet are drawn. Per preset in the reference too. */
export function RevealSection({ preset, setOverride }: PresetSectionProps) {
  return (
    <Section
      title="Reveal"
      badge={<SessionOnlyBadge />}
      hint="Words already spoken always stay fully visible. This is only about what is coming."
    >
      <SegmentedField
        label="Upcoming words"
        value={preset.reveal}
        options={[
          { value: 'none', label: 'Show', title: 'The whole line at full opacity' },
          { value: 'dim', label: 'Dim', title: 'Faded back until the playhead arrives' },
          { value: 'hidden', label: 'Hide', title: 'Fully transparent until the playhead arrives' },
        ]}
        onChange={(value) => setOverride({ reveal: value })}
      />
    </Section>
  )
}

/**
 * Preset-only extras that belong inside a shared section rather than a section of their own —
 * they are rendered through TextSection's and EffectsSection's children slot.
 */
export function AlignField({ preset, setOverride }: PresetSectionProps) {
  return (
    <SegmentedField
      label="Alignment"
      value={preset.align ?? 'center'}
      options={[
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ]}
      onChange={(value) => setOverride({ align: value })}
    />
  )
}

export function GlowLayersField({ preset, setOverride }: PresetSectionProps) {
  return (
    <NumberField
      label="Glow layers"
      value={preset.glowLayers ?? DEFAULT_GLOW_LAYERS}
      min={1}
      max={6}
      onChange={(value) => setOverride({ glowLayers: value })}
    />
  )
}
