import { useRef, useState } from 'react'
import { Copy, Film, ImageIcon, Layers, Scissors, Trash2, Upload, Volume2, VolumeX } from 'lucide-react'
import type { LayerItem } from '@captions/shared'
import { LAYER_MEDIA_TYPES } from '@/lib/api'
import { formatTimestamp } from '@/lib/format'
import { clampTransform, moveItemTo, trimItemEnd } from '@/lib/layers'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { useLayerEditor } from '@/state/layer-editor-context'
import { usePlayback } from '@/state/playback-context'
import { useProject } from '@/state/project-context'
import { Section } from './fields'

/** The nine anchors people actually ask for: "top right", "centre", "bottom left"… */
const ANCHORS: { label: string; x: number; y: number }[] = [
  { label: 'Top left', x: 20, y: 15 }, { label: 'Top', x: 50, y: 15 }, { label: 'Top right', x: 80, y: 15 },
  { label: 'Left', x: 20, y: 50 }, { label: 'Centre', x: 50, y: 50 }, { label: 'Right', x: 80, y: 50 },
  { label: 'Bottom left', x: 20, y: 85 }, { label: 'Bottom', x: 50, y: 85 }, { label: 'Bottom right', x: 80, y: 85 },
]

/**
 * The Layers tab: every image and clip over the video, and the selected one's properties.
 *
 * Nothing here writes on its own; every control goes through `useLayerEditor`, so a change is one
 * save and one Ctrl+Z. Sliders follow the drag from a local draft and save ONCE on release — the
 * style panel's per-tick writes would make every pixel of a drag its own undo step here, because
 * a layer edit rewrites the whole list.
 */
export function LayerPanel({ onSelect }: { onSelect: (id: string | null) => void }) {
  const editor = useLayerEditor()
  const { project } = useProject()
  const { seek } = usePlayback()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [splitError, setSplitError] = useState<string | null>(null)
  const item = editor.selected

  const byTrack = [2, 1].map((track) => ({
    track,
    items: editor.layers.filter((candidate) => candidate.track === track).sort((a, b) => a.startMs - b.startMs),
  }))

  return (
    <div className="flex flex-col" data-layer-panel>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-3">
        <p className="text-[11px] text-muted-foreground">
          Images and clips over the video — two layers, both under the captions.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={LAYER_MEDIA_TYPES.join(',')}
          className="hidden"
          data-layer-file
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void editor.addFile(file).then((id) => id && onSelect(id))
          }}
        />
        <button
          type="button"
          disabled={!editor.canAddMedia || editor.uploading !== null}
          onClick={() => fileRef.current?.click()}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Upload className="size-3.5" />
          Add media
        </button>
      </div>

      {!editor.canAddMedia && (
        <p className="mx-3 mt-3 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          The bundled demo has no saved project to hold media. Upload a video to add layers.
        </p>
      )}
      {editor.uploading && (
        <div className="mx-3 mt-3 text-[11px] text-muted-foreground" role="status">
          Uploading {editor.uploading.name}… {editor.uploading.pct}%
          <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${editor.uploading.pct}%` }} />
          </div>
        </div>
      )}
      {(editor.error || splitError) && (
        <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{editor.error ?? splitError}</span>
          <button type="button" className="shrink-0 underline" onClick={() => { editor.clearError(); setSplitError(null) }}>
            dismiss
          </button>
        </div>
      )}

      {editor.layers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-xs text-muted-foreground">
          <Layers className="size-5" />
          No media yet. Add a logo, a reaction image or a B-roll clip — it lands at the playhead.
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-3 py-3">
          {byTrack.map(({ track, items }) => (
            <div key={track}>
              <p className="eyebrow mb-1 text-[10px] text-muted-foreground">Layer {track}{track === 2 ? ' · on top' : ''}</p>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60">Empty</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {items.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(candidate.id)
                          seek(candidate.startMs)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                          candidate.id === editor.selectedLayerId ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-muted/50',
                        )}
                      >
                        {candidate.kind === 'video' ? <Film className="size-3.5 shrink-0" /> : <ImageIcon className="size-3.5 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate">{candidate.name ?? candidate.id}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                          {formatTimestamp(candidate.startMs)}–{formatTimestamp(candidate.endMs)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {item && (
        <ItemProperties
          key={item.id}
          item={item}
          durationMs={project.durationMs}
          onChange={editor.update}
          onSplit={() => setSplitError(editor.splitAtPlayhead())}
          onDuplicate={() => editor.duplicate(item.id)}
          onRemove={() => editor.remove(item.id)}
        />
      )}
    </div>
  )
}

function ItemProperties({
  item,
  durationMs,
  onChange,
  onSplit,
  onDuplicate,
  onRemove,
}: {
  item: LayerItem
  durationMs: number
  onChange: (item: LayerItem) => void
  onSplit: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const transform = (patch: Partial<LayerItem>) => onChange(clampTransform({ ...item, ...patch }))
  return (
    <div className="border-t border-border/60" data-layer-properties={item.id}>
      <div className="flex flex-wrap gap-1.5 px-3 pt-3">
        <Action icon={Scissors} label="Split at playhead" hint="Ctrl/⌘ B" onClick={onSplit} />
        <Action icon={Copy} label="Duplicate" onClick={onDuplicate} />
        <Action
          icon={Layers}
          label={`Move to layer ${item.track === 1 ? 2 : 1}`}
          onClick={() => onChange({ ...item, track: item.track === 1 ? 2 : 1 })}
        />
        {item.kind === 'video' && (
          <Action
            icon={item.muted ? VolumeX : Volume2}
            label={item.muted ? 'Unmute' : 'Mute'}
            onClick={() => onChange({ ...item, muted: !item.muted })}
          />
        )}
        <Action icon={Trash2} label="Delete" hint="Del" onClick={onRemove} destructive />
      </div>

      <Section title="Timing" hint="When it is on screen. Drag its edges on the timeline to trim.">
        <LiveNumber label="Starts" value={item.startMs / 1000} min={0} max={durationMs / 1000} step={0.05} suffix="s" decimals={2}
          onCommit={(s) => onChange(moveItemTo(item, s * 1000, durationMs))} />
        <LiveNumber label="Ends" value={item.endMs / 1000} min={0} max={durationMs / 1000} step={0.05} suffix="s" decimals={2}
          onCommit={(s) => onChange(trimItemEnd(item, s * 1000, durationMs))} />
        {item.kind === 'video' && (
          <LiveNumber
            label="Clip starts from"
            value={item.trimStartMs / 1000}
            min={0}
            max={Math.max(0, ((item.sourceDurationMs ?? item.trimStartMs + 1000) - (item.endMs - item.startMs)) / 1000)}
            step={0.05}
            suffix="s"
            decimals={2}
            onCommit={(s) => onChange({ ...item, trimStartMs: Math.round(s * 1000) })}
          />
        )}
        <p className="text-[10px] text-muted-foreground">Or drag its left edge: that trims the start of the clip too.</p>
      </Section>

      <Section title="Position" hint="Or drag it on the video; corners scale it, the round handle rotates it.">
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Anchor">
          {ANCHORS.map((anchor) => (
            <button
              key={anchor.label}
              type="button"
              title={anchor.label}
              aria-label={anchor.label}
              onClick={() => transform({ x: anchor.x, y: anchor.y })}
              className={cn(
                'h-6 rounded border border-border/70 text-[10px] text-muted-foreground hover:border-primary/60 hover:text-foreground',
                Math.abs(item.x - anchor.x) < 0.5 && Math.abs(item.y - anchor.y) < 0.5 && 'border-primary bg-primary/15 text-foreground',
              )}
            >
              {anchor.label.split(' ').map((w) => w[0]).join('')}
            </button>
          ))}
        </div>
        <LiveNumber label="X (centre)" value={item.x} min={-50} max={150} step={0.5} suffix="%" decimals={1} onCommit={(x) => transform({ x })} />
        <LiveNumber label="Y (centre)" value={item.y} min={-50} max={150} step={0.5} suffix="%" decimals={1} onCommit={(y) => transform({ y })} />
        <LiveNumber label="Size" value={item.width} min={2} max={200} step={0.5} suffix="% of width" decimals={1} onCommit={(width) => transform({ width })} />
        <LiveNumber label="Rotation" value={item.rotation} min={-180} max={180} step={1} suffix="°" onCommit={(rotation) => transform({ rotation })} />
        <LiveNumber label="Opacity" value={item.opacity * 100} min={0} max={100} step={1} suffix="%" onCommit={(pct) => transform({ opacity: pct / 100 })} />
      </Section>
    </div>
  )
}

/** A slider that follows the drag locally and reports ONCE, on release. */
function LiveNumber({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  decimals = 0,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  decimals?: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{shown.toFixed(decimals)}{suffix}</span>
      </div>
      <Slider
        aria-label={label}
        value={[shown]}
        min={min}
        max={Math.max(min, max)}
        step={step}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([next]) => {
          setDraft(null)
          if (next !== value) onCommit(next)
        }}
      />
    </div>
  )
}

function Action({
  icon: Icon,
  label,
  hint,
  onClick,
  destructive,
}: {
  icon: typeof Scissors
  label: string
  hint?: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-[11px]',
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
