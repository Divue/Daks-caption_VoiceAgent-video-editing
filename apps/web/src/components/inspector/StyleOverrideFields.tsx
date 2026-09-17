import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Style } from '@captions/shared'

interface StyleOverrideFieldsProps {
  style: Partial<Style> | undefined
  onChange: (style: Partial<Style> | undefined) => void
}

const DEFAULTS: Style = {
  fontFamily: 'Inter',
  fontSize: 48,
  color: '#ffffff',
  gradient: ['#ffffff', '#000000'],
  weight: 400,
  uppercase: false,
  glow: 0,
  shake: 0,
  x: 50,
  y: 50,
}

/** Sets or clears one field of the style override, dropping the whole object once nothing is left. */
function withField<K extends keyof Style>(
  style: Partial<Style> | undefined,
  key: K,
  value: Style[K] | undefined,
): Partial<Style> | undefined {
  const next: Partial<Style> = { ...style, [key]: value }
  const hasAnyField = Object.values(next).some((fieldValue) => fieldValue !== undefined)
  return hasAnyField ? next : undefined
}

export function StyleOverrideFields({ style, onChange }: StyleOverrideFieldsProps) {
  const toggle = <K extends keyof Style>(key: K, enabled: boolean) => {
    onChange(withField(style, key, enabled ? DEFAULTS[key] : undefined))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-foreground">Style override</p>

      <OverrideRow
        label="Font family"
        enabled={style?.fontFamily !== undefined}
        onToggle={(enabled) => toggle('fontFamily', enabled)}
      >
        <Input
          value={style?.fontFamily ?? ''}
          onChange={(event) => onChange(withField(style, 'fontFamily', event.target.value))}
        />
      </OverrideRow>

      <OverrideRow
        label="Font size (px)"
        enabled={style?.fontSize !== undefined}
        onToggle={(enabled) => toggle('fontSize', enabled)}
      >
        <NumberField
          value={style?.fontSize}
          min={1}
          onChange={(value) => onChange(withField(style, 'fontSize', value))}
        />
      </OverrideRow>

      <OverrideRow
        label="Color"
        enabled={style?.color !== undefined}
        onToggle={(enabled) => toggle('color', enabled)}
      >
        <Input
          value={style?.color ?? ''}
          onChange={(event) => onChange(withField(style, 'color', event.target.value))}
        />
      </OverrideRow>

      <OverrideRow
        label="Gradient"
        enabled={style?.gradient !== undefined}
        onToggle={(enabled) => toggle('gradient', enabled)}
      >
        <div className="flex gap-2">
          <Input
            value={style?.gradient?.[0] ?? ''}
            onChange={(event) =>
              onChange(withField(style, 'gradient', [event.target.value, style?.gradient?.[1] ?? '']))
            }
          />
          <Input
            value={style?.gradient?.[1] ?? ''}
            onChange={(event) =>
              onChange(withField(style, 'gradient', [style?.gradient?.[0] ?? '', event.target.value]))
            }
          />
        </div>
      </OverrideRow>

      <OverrideRow
        label="Weight"
        enabled={style?.weight !== undefined}
        onToggle={(enabled) => toggle('weight', enabled)}
      >
        <NumberField
          value={style?.weight}
          min={100}
          max={900}
          onChange={(value) => onChange(withField(style, 'weight', value))}
        />
      </OverrideRow>

      <OverrideRow
        label="Uppercase"
        enabled={style?.uppercase !== undefined}
        onToggle={(enabled) => toggle('uppercase', enabled)}
      >
        <Switch
          checked={style?.uppercase ?? false}
          onCheckedChange={(checked) => onChange(withField(style, 'uppercase', checked))}
        />
      </OverrideRow>

      <OverrideRow
        label="Glow"
        enabled={style?.glow !== undefined}
        onToggle={(enabled) => toggle('glow', enabled)}
      >
        <NumberField value={style?.glow} min={0} onChange={(value) => onChange(withField(style, 'glow', value))} />
      </OverrideRow>

      <OverrideRow
        label="Shake"
        enabled={style?.shake !== undefined}
        onToggle={(enabled) => toggle('shake', enabled)}
      >
        <NumberField value={style?.shake} min={0} onChange={(value) => onChange(withField(style, 'shake', value))} />
      </OverrideRow>

      <OverrideRow
        label="Position X (%)"
        enabled={style?.x !== undefined}
        onToggle={(enabled) => toggle('x', enabled)}
      >
        <NumberField
          value={style?.x}
          min={0}
          max={100}
          onChange={(value) => onChange(withField(style, 'x', value))}
        />
      </OverrideRow>

      <OverrideRow
        label="Position Y (%)"
        enabled={style?.y !== undefined}
        onToggle={(enabled) => toggle('y', enabled)}
      >
        <NumberField
          value={style?.y}
          min={0}
          max={100}
          onChange={(value) => onChange(withField(style, 'y', value))}
        />
      </OverrideRow>
    </div>
  )
}

interface OverrideRowProps {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: ReactNode
}

function OverrideRow({ label, enabled, onToggle, children }: OverrideRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children}
    </div>
  )
}

interface NumberFieldProps {
  value: number | undefined
  min?: number
  max?: number
  onChange: (value: number) => void
}

function NumberField({ value, min, max, onChange }: NumberFieldProps) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
    />
  )
}
