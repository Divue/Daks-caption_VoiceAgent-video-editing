import type { ReactNode } from 'react'
import { CAPTION_FONTS } from '@captions/shared'
import type { Style, TextCase } from '@captions/shared'
import { ColorField, Field, NumberField, SegmentedField, SelectField, Section } from './fields'
import { STYLE_DEFAULTS, isOverridden, scopeValue } from './style-scope'
import type { StyleScope } from './style-scope'

/**
 * The style sections that work identically at preset scope and word scope.
 *
 * They are written once and take a `StyleScope`, because "make every caption yellow" and "make
 * this word yellow" are the same edit against a different set of word ids. Anything that is a
 * CONDITIONAL layer (emphasis, sentiment, reveal, stretch) is NOT here — it has no per-word home,
 * so it lives in the preset sections instead.
 */

// Six options is a list, not a segmented control — at panel width each cell was ~35px of
// unreadable, untappable text (audit 16 §2.9).
const WEIGHTS = [
  { value: '300', label: 'Light — 300' },
  { value: '400', label: 'Regular — 400' },
  { value: '600', label: 'Semibold — 600' },
  { value: '700', label: 'Bold — 700' },
  { value: '800', label: 'Extrabold — 800' },
  { value: '900', label: 'Black — 900' },
] as const

const CASES: { value: TextCase; label: string; title: string }[] = [
  { value: 'none', label: 'Tt', title: 'As written' },
  { value: 'upper', label: 'TT', title: 'UPPERCASE' },
  { value: 'lower', label: 'tt', title: 'lowercase' },
]

const FONT_OPTIONS = CAPTION_FONTS.map((font) => ({ value: font, label: font }))

function clear(scope: StyleScope, key: keyof Style) {
  // An explicit null, not a missing key — this is the removal the server understands.
  return () => scope.write({ [key]: null })
}

export function TextSection({ scope, children }: { scope: StyleScope; children?: ReactNode }) {
  const family = scopeValue(scope, 'fontFamily') ?? 'Inter'
  const weight = scopeValue(scope, 'weight') ?? 400
  const size = scopeValue(scope, 'fontSize') ?? 64
  const textCase = scopeValue(scope, 'textCase') ?? STYLE_DEFAULTS.textCase
  const italic = scopeValue(scope, 'italic') ?? STYLE_DEFAULTS.italic

  return (
    <Section
      title="Text"
      hint={scope.kind === 'preset' ? 'Applies to every caption word.' : undefined}
    >
      <SelectField
        label="Font family"
        value={family}
        options={FONT_OPTIONS}
        isOverridden={isOverridden(scope, 'fontFamily')}
        onChange={(value) => scope.write({ fontFamily: value })}
        onClear={clear(scope, 'fontFamily')}
      />
      <SelectField
        label="Weight"
        value={String(weight)}
        options={WEIGHTS}
        isOverridden={isOverridden(scope, 'weight')}
        onChange={(value) => scope.write({ weight: Number(value) })}
        onClear={clear(scope, 'weight')}
      />
      <SegmentedField
        label="Face"
        value={italic ? 'italic' : 'upright'}
        options={[
          { value: 'upright', label: 'Regular' },
          { value: 'italic', label: 'Italic' },
        ]}
        isOverridden={isOverridden(scope, 'italic')}
        onChange={(value) => scope.write({ italic: value === 'italic' })}
        onClear={clear(scope, 'italic')}
      />
      <NumberField
        label="Size"
        value={size}
        min={16}
        max={220}
        suffix="px"
        isOverridden={isOverridden(scope, 'fontSize')}
        onChange={(value) => scope.write({ fontSize: value })}
        onClear={clear(scope, 'fontSize')}
      />
      <SegmentedField
        label="Case"
        value={textCase}
        options={CASES}
        isOverridden={isOverridden(scope, 'textCase')}
        onChange={(value) => scope.write({ textCase: value })}
        onClear={clear(scope, 'textCase')}
      />
      <FillFields scope={scope} />
      {children}
    </Section>
  )
}

/** Solid or gradient fill. A preset may carry a multi-stop gradient the 2-colour picker cannot
 *  express, so that case is shown read-only rather than silently flattened to two stops. */
function FillFields({ scope }: { scope: StyleScope }) {
  const color = scopeValue(scope, 'color') ?? '#FFFFFF'
  const gradient = scopeValue(scope, 'gradient')
  const stops = scopeValue(scope, 'gradientStops')
  const mode = stops ? 'stops' : gradient ? 'gradient' : 'solid'

  return (
    <>
      <SegmentedField
        label="Fill"
        value={mode === 'stops' ? 'gradient' : mode}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
        onChange={(value) => {
          if (value === 'solid') scope.write({ gradient: null, gradientStops: null })
          else if (!gradient && !stops) scope.write({ gradient: [color, '#000000'] })
        }}
      />

      {mode === 'solid' && (
        <ColorField
          label="Colour"
          value={color}
          isOverridden={isOverridden(scope, 'color')}
          onChange={(value) => scope.write({ color: value })}
          onClear={clear(scope, 'color')}
        />
      )}

      {mode === 'gradient' && gradient && (
        <Field
          label="Gradient"
          isOverridden={isOverridden(scope, 'gradient')}
          onClear={clear(scope, 'gradient')}
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Gradient start"
              value={gradient[0]}
              onChange={(event) => scope.write({ gradient: [event.target.value, gradient[1]] })}
              className="h-8 flex-1 cursor-pointer rounded-md border border-border bg-transparent"
            />
            <input
              type="color"
              aria-label="Gradient end"
              value={gradient[1]}
              onChange={(event) => scope.write({ gradient: [gradient[0], event.target.value] })}
              className="h-8 flex-1 cursor-pointer rounded-md border border-border bg-transparent"
            />
          </div>
        </Field>
      )}

      {mode === 'stops' && stops && (
        <Field label="Gradient" isOverridden={isOverridden(scope, 'gradientStops')} onClear={clear(scope, 'gradientStops')}>
          <div
            className="h-8 rounded-md border border-border"
            style={{
              backgroundImage: `linear-gradient(90deg, ${stops
                .map((stop) => `${stop.color} ${stop.at}%`)
                .join(', ')})`,
            }}
          />
          <p className="text-[10px] text-muted-foreground">
            {stops.length} stops — switch to Solid to replace it.
          </p>
        </Field>
      )}
    </>
  )
}

export function PositionSection({ scope }: { scope: StyleScope }) {
  const x = scopeValue(scope, 'x') ?? 50
  const y = scopeValue(scope, 'y') ?? 70
  return (
    <Section title="Position">
      <NumberField
        label="X"
        value={x}
        min={0}
        max={100}
        suffix="%"
        decimals={1}
        step={0.5}
        isOverridden={isOverridden(scope, 'x')}
        onChange={(value) => scope.write({ x: value })}
        onClear={clear(scope, 'x')}
      />
      <NumberField
        label="Y"
        value={y}
        min={0}
        max={100}
        suffix="%"
        decimals={1}
        step={0.5}
        isOverridden={isOverridden(scope, 'y')}
        onChange={(value) => scope.write({ y: value })}
        onClear={clear(scope, 'y')}
      />
    </Section>
  )
}

export function SpacingSection({ scope }: { scope: StyleScope }) {
  const letterSpacing = scopeValue(scope, 'letterSpacing') ?? STYLE_DEFAULTS.letterSpacing
  const lineHeight = scopeValue(scope, 'lineHeight') ?? STYLE_DEFAULTS.lineHeight
  return (
    <Section
      title="Spacing"
      hint="Letter spacing is em-relative, so it holds its proportion when the size changes."
    >
      <NumberField
        label="Letter spacing"
        value={letterSpacing}
        min={-0.15}
        max={0.3}
        step={0.001}
        decimals={3}
        suffix="em"
        isOverridden={isOverridden(scope, 'letterSpacing')}
        onChange={(value) => scope.write({ letterSpacing: value })}
        onClear={clear(scope, 'letterSpacing')}
      />
      <NumberField
        label="Line height"
        value={lineHeight}
        min={0.7}
        max={2}
        step={0.05}
        decimals={2}
        isOverridden={isOverridden(scope, 'lineHeight')}
        onChange={(value) => scope.write({ lineHeight: value })}
        onClear={clear(scope, 'lineHeight')}
      />
    </Section>
  )
}

export function EffectsSection({ scope, children }: { scope: StyleScope; children?: ReactNode }) {
  const glow = scopeValue(scope, 'glow') ?? STYLE_DEFAULTS.glow
  const glowColor = scopeValue(scope, 'glowColor') ?? scopeValue(scope, 'color') ?? '#FFFFFF'
  const strokeWidth = scopeValue(scope, 'strokeWidth') ?? STYLE_DEFAULTS.strokeWidth
  const strokeColor = scopeValue(scope, 'strokeColor') ?? STYLE_DEFAULTS.strokeColor
  const shake = scopeValue(scope, 'shake') ?? STYLE_DEFAULTS.shake

  return (
    <Section
      title="Effects"
      hint="The glow is drawn as stacked layers at decreasing alpha — one flat shadow bands."
    >
      <NumberField
        label="Glow radius"
        value={glow}
        min={0}
        max={160}
        suffix="px"
        isOverridden={isOverridden(scope, 'glow')}
        onChange={(value) => scope.write({ glow: value })}
        onClear={clear(scope, 'glow')}
      />
      {glow > 0 && (
        <ColorField
          label="Glow colour"
          value={glowColor}
          isOverridden={isOverridden(scope, 'glowColor')}
          onChange={(value) => scope.write({ glowColor: value })}
          onClear={clear(scope, 'glowColor')}
        />
      )}
      <NumberField
        label="Stroke"
        value={strokeWidth}
        min={0}
        max={24}
        suffix="px"
        isOverridden={isOverridden(scope, 'strokeWidth')}
        onChange={(value) => scope.write({ strokeWidth: value })}
        onClear={clear(scope, 'strokeWidth')}
      />
      {strokeWidth > 0 && (
        <ColorField
          label="Stroke colour"
          value={strokeColor}
          isOverridden={isOverridden(scope, 'strokeColor')}
          onChange={(value) => scope.write({ strokeColor: value })}
          onClear={clear(scope, 'strokeColor')}
        />
      )}
      <NumberField
        label="Shake"
        value={shake}
        min={0}
        max={20}
        suffix="px"
        isOverridden={isOverridden(scope, 'shake')}
        onChange={(value) => scope.write({ shake: value })}
        onClear={clear(scope, 'shake')}
      />
      {children}
    </Section>
  )
}
