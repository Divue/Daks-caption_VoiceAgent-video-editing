import { Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProject } from '@/state/project-context'

export function UndoRedoControls() {
  const { dispatch, canUndo, canRedo } = useProject()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => dispatch({ type: 'UNDO' })}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => dispatch({ type: 'REDO' })}
      >
        <Redo2 />
      </Button>
    </div>
  )
}
