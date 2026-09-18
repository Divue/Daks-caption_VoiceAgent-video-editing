import { PRESETS } from '@captions/shared'
import { CaptionLine } from '@/components/captions/CaptionLine'
import { useProject } from '@/state/project-context'

interface CaptionPreviewOverlayProps {
  /** The group containing this word is shown; with nothing selected, the first group. */
  selectedWordId: string | null
}

/**
 * Real project words rendered with the real preset and every layer (emphasis, emotion,
 * the word's own style override) through the shared CaptionLine — the same renderer the
 * landing page uses. Shows one caption group of `preset.wordsPerLine` words. Sizes are in
 * cqmin, so the parent frame must be a size container.
 */
export function CaptionPreviewOverlay({ selectedWordId }: CaptionPreviewOverlayProps) {
  const { project } = useProject()
  const perLine = PRESETS[project.presetId].wordsPerLine
  const selectedIndex = Math.max(0, project.words.findIndex((word) => word.id === selectedWordId))
  const groupStart = Math.floor(selectedIndex / perLine) * perLine
  const words = project.words.slice(groupStart, groupStart + perLine)

  if (words.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[12%]">
      <CaptionLine
        presetId={project.presetId}
        words={words.map((word) => ({
          text: word.text,
          emphasis: word.emphasis,
          emotion: word.emotion,
          emoji: word.emoji,
          style: word.style,
        }))}
      />
    </div>
  )
}
