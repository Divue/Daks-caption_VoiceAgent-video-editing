import { useRef } from 'react'
import { Gauge, ImagePlus, Link, Magnet, Music, Scissors, Shuffle, Trash2, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InertControl } from '@/components/layout/InertControl'
import { LAYER_MEDIA_TYPES } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLayerEditor } from '@/state/layer-editor-context'

const OUT_OF_SCOPE = 'not built yet'

/**
 * The timeline tools.
 *
 * The first group is REAL and acts on media layers: add an image or clip at the playhead, split the
 * selected item at the playhead (Ctrl/Cmd+B), delete it (Del). Each is disabled, with a reason in
 * its tooltip, whenever it would do nothing — a Split button that silently ignores you is worse
 * than none. "Trim" is not a button: it is dragging an item's edge, which is how every editor does
 * it, so a button for it was a picture of a feature.
 *
 * The rest are still INERT and look it — `InertControl` gives them a disabled attribute, a muted
 * foreground, a not-allowed cursor and a tooltip saying so, because `.claude/INDEX.md` forbids
 * faking behaviour.
 */
const INERT: { label: string; icon: LucideIcon }[][] = [
  [
    { label: 'Snapping', icon: Magnet },
    { label: 'Link tracks', icon: Link },
  ],
  [
    { label: 'Transitions', icon: Shuffle },
    { label: 'Effects', icon: Wand2 },
    { label: 'Music', icon: Music },
    { label: 'Speed', icon: Gauge },
  ],
]

export function EditorToolbar({ onSelectLayer }: { onSelectLayer: (id: string) => void }) {
  const editor = useLayerEditor()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const selected = editor.selected

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      <input
        ref={fileRef}
        type="file"
        accept={LAYER_MEDIA_TYPES.join(',')}
        className="hidden"
        data-layer-file
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          const id = await editor.addFile(file)
          if (id) onSelectLayer(id)
        }}
      />
      <Tool
        label={editor.uploading ? `Uploading… ${editor.uploading.pct}%` : 'Add media'}
        icon={ImagePlus}
        disabledReason={!editor.canAddMedia ? 'Open a saved project to add media' : editor.uploading ? 'Uploading…' : null}
        onClick={() => fileRef.current?.click()}
      />
      <Tool
        label="Split"
        icon={Scissors}
        disabledReason={selected ? null : 'Select a layer item to split it'}
        onClick={() => editor.splitAtPlayhead()}
      />
      <Tool
        label="Delete"
        icon={Trash2}
        disabledReason={selected ? null : 'Select a layer item to delete it'}
        onClick={() => selected && editor.remove(selected.id)}
      />
      {INERT.map((group) => (
        <div key={group[0].label} className="flex shrink-0 items-center gap-0.5">
          <span className="mx-1 h-4 w-px shrink-0 bg-border/60" aria-hidden />
          {group.map(({ label, icon }) => (
            <InertControl key={label} label={label} icon={icon} reason={OUT_OF_SCOPE} className="px-1.5 py-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function Tool({
  label,
  icon: Icon,
  disabledReason,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabledReason: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabledReason !== null}
      title={disabledReason ?? label}
      aria-label={label}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-foreground/85 transition-colors hover:bg-muted/60',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  )
}
