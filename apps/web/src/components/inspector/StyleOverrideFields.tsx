import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
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

const FONT_OPTIONS = ['Inter', 'Instrument Serif', 'Anton', 'Poppins', 'Komika Axis']
const BOLD_WEIGHT = 700
const REGULAR_WEIGHT = 400

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
  const [showMore, setShowMore] = useState(false)

  const toggle = <K extends keyof Style>(key: K, enabled: boolean) => {
    onChange(withField(style, key, enabled ? DEFAULTS[key] : undefined))
  }

  const isBold = (style?.weight ?? REGULAR_WEIGHT) >= BOLD_WEIGHT

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Style</p>

      <div className="flex flex-col gap-1.5">
        <Label>Font</Label>
        <Select
          value={style?.fontFamily ?? DEFAULTS.fontFamily}
          onValueChange={(value) => onChange(withField(style, 'fontFamily', value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Size</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{style?.fontSize ?? DEFAULTS.fontSize}px</span>
        </div>
        <Slider
          value={[style?.fontSize ?? DEFAULTS.fontSize]}
          min={16}
          max={120}
          step={1}
          onValueChange={([value]) => onChange(withField(style, 'fontSize', value))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Color"
            value={style?.color ?? DEFAULTS.color}
            onChange={(event) => onChange(withField(style, 'color', event.target.value))}
            className="size-9 shrink-0 cursor-pointer rounded-md border"
          />
          <Input
            value={style?.color ?? DEFAULTS.color}
            onChange={(event) => onChange(withField(style, 'color', event.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label>Bold</Label>
        <Switch
          checked={isBold}
          onCheckedChange={(checked) =>
            onChange(withField(style, 'weight', checked ? BOLD_WEIGHT : REGULAR_WEIGHT))
          }
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((value) => !value)}
        className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', showMore && 'rotate-180')} />
        {showMore ? 'Fewer style options' : 'More style options'}
      </button>

      {showMore && (
        <div className="flex flex-col gap-4 border-t pt-4">
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
            label="Gradient"
            enabled={style?.gradient !== undefined}
            onToggle={(enabled) => toggle('gradient', enabled)}
          >
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Gradient start"
                value={style?.gradient?.[0] ?? '#ffffff'}
                onChange={(event) =>
                  onChange(withField(style, 'gradient', [event.target.value, style?.gradient?.[1] ?? '#000000']))
                }
                className="size-9 flex-1 cursor-pointer rounded-md border"
              />
              <input
                type="color"
                aria-label="Gradient end"
                value={style?.gradient?.[1] ?? '#000000'}
                onChange={(event) =>
                  onChange(withField(style, 'gradient', [style?.gradient?.[0] ?? '#ffffff', event.target.value]))
                }
                className="size-9 flex-1 cursor-pointer rounded-md border"
              />
            </div>
          </OverrideRow>

          <SliderOverrideRow
            label="Glow"
            value={style?.glow}
            min={0}
            max={20}
            enabled={style?.glow !== undefined}
            onToggle={(enabled) => toggle('glow', enabled)}
            onChange={(value) => onChange(withField(style, 'glow', value))}
          />
          <SliderOverrideRow
            label="Shake"
            value={style?.shake}
            min={0}
            max={20}
            enabled={style?.shake !== undefined}
            onToggle={(enabled) => toggle('shake', enabled)}
            onChange={(value) => onChange(withField(style, 'shake', value))}
          />
          <SliderOverrideRow
            label="Position X (%)"
            value={style?.x}
            min={0}
            max={100}
            enabled={style?.x !== undefined}
            onToggle={(enabled) => toggle('x', enabled)}
            onChange={(value) => onChange(withField(style, 'x', value))}
          />
          <SliderOverrideRow
            label="Position Y (%)"
            value={style?.y}
            min={0}
            max={100}
            enabled={style?.y !== undefined}
            onToggle={(enabled) => toggle('y', enabled)}
            onChange={(value) => onChange(withField(style, 'y', value))}
          />
        </div>
      )}
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

interface SliderOverrideRowProps {
  label: string
  value: number | undefined
  min: number
  max: number
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onChange: (value: number) => void
}

function SliderOverrideRow({ label, value, min, max, enabled, onToggle, onChange }: SliderOverrideRowProps) {
  return (
    <OverrideRow label={label} enabled={enabled} onToggle={onToggle}>
      <div className="flex items-center gap-3">
        <Slider
          value={[value ?? min]}
          min={min}
          max={max}
          step={1}
          onValueChange={([next]) => onChange(next)}
          className="flex-1"
        />
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{value ?? min}</span>
      </div>
    </OverrideRow>
  )
}
