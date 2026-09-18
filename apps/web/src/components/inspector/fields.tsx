import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

/**
 * Shared controls for the caption style panel.
 *
 * Every control here takes a `set` and, where the value can be cleared, an `onClear`. A cleared
 * field must send an explicit removal, never `undefined` — see lib/style-change.ts for the bug
 * that convention exists to prevent.
 */

export function Section({
  title,
  hint,
  badge,
  children,
}: {
  title: string
  hint?: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    // A section has to READ as a group, or a long panel is one undifferentiated list of controls
    // (audit 16 §2.10). The header gets the full eyebrow treatment and a rule; the fields below it
    // drop to a quieter weight, so the eye lands on section names first and controls second.
    <section className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <h3 className="eyebrow shrink-0 text-foreground/70">{title}</h3>
        <span className="h-px min-w-3 flex-1 bg-border/70" />
        {badge}
      </div>
      {hint && <p className="-mt-1.5 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** Marks a control whose value lives in `Preset` and therefore only lasts for this session. */
export function SessionOnlyBadge() {
  return (
    <span
      title="Tunes the live preview. Not saved — the value has no per-word home in the stored project."
      className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
    >
      session only
    </span>
  )
}

export function Field({
  label,
  value,
  isOverridden,
  onClear,
  children,
}: {
  label: string
  /** Rendered at the right of the label as the current value. */
  value?: ReactNode
  isOverridden?: boolean
  onClear?: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label className={cn('text-[11px] font-normal text-muted-foreground', isOverridden && 'text-foreground')}>
          {label}
          {isOverridden && <span className="ml-1 text-primary" aria-label="overridden">•</span>}
        </Label>
        <div className="flex items-center gap-1.5">
          {value !== undefined && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>
          )}
          {isOverridden && onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Reset to the preset value"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  decimals = 0,
  isOverridden,
  onChange,
  onClear,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  decimals?: number
  isOverridden?: boolean
  onChange: (value: number) => void
  onClear?: () => void
}) {
  return (
    <Field
      label={label}
      value={`${value.toFixed(decimals)}${suffix}`}
      isOverridden={isOverridden}
      onClear={onClear}
    >
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      />
    </Field>
  )
}

export function ColorField({
  label,
  value,
  isOverridden,
  onChange,
  onClear,
}: {
  label: string
  value: string
  isOverridden?: boolean
  onChange: (value: string) => void
  onClear?: () => void
}) {
  return (
    <Field label={label} isOverridden={isOverridden} onClear={onClear}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={normalizeHex(value)}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 font-mono text-xs"
        />
      </div>
    </Field>
  )
}

/** `<input type="color">` only accepts `#rrggbb`; anything else would silently reset it to black. */
function normalizeHex(value: string): string {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return '#FFFFFF'
  const digits = match[1]
  if (digits.length === 6) return `#${digits}`
  return `#${digits
    .split('')
    .map((digit) => digit + digit)
    .join('')}`
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  isOverridden,
  onChange,
  onClear,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[] | readonly T[]
  isOverridden?: boolean
  onChange: (value: T) => void
  onClear?: () => void
}) {
  const normalized = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  )
  return (
    <Field label={label} isOverridden={isOverridden} onClear={onClear}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {normalized.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** A compact segmented control — the panel has a lot of 2-4 way choices and selects eat space. */
export function SegmentedField<T extends string>({
  label,
  value,
  options,
  isOverridden,
  onChange,
  onClear,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; title?: string }[]
  isOverridden?: boolean
  onChange: (value: T) => void
  onClear?: () => void
}) {
  return (
    <Field label={label} isOverridden={isOverridden} onClear={onClear}>
      <div className="flex rounded-md border border-border bg-muted/40 p-0.5" role="group">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors',
              value === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  )
}
