import { Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'

export function UndoRedoControls() {
  const { canUndo, canRedo } = useProject()
  // The saving undo/redo — a raw UNDO dispatch changes only the screen (see useWordPatch).
  const { undo, redo } = useWordPatch()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => undo()}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => redo()}
      >
        <Redo2 />
      </Button>
    </div>
  )
}
