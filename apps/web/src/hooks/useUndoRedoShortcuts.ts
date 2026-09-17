import { useEffect } from 'react'
import { useProject } from '@/state/project-context'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** Wires Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo) to the project history. */
export function useUndoRedoShortcuts() {
  const { dispatch } = useProject()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      if (!(event.ctrlKey || event.metaKey)) return

      const key = event.key.toLowerCase()
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey)
      const isUndo = key === 'z' && !event.shiftKey

      if (isUndo) {
        event.preventDefault()
        dispatch({ type: 'UNDO' })
      } else if (isRedo) {
        event.preventDefault()
        dispatch({ type: 'REDO' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch])
}
