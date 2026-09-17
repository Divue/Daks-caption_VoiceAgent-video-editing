import { useProject } from './state/project-context'
import './App.css'

/**
 * Temporary proof that ProjectProvider works end to end (Step 2 of the plan).
 * Replaced by the real editor layout in Step 3.
 */
function App() {
  const { project, dispatch, canUndo, canRedo } = useProject()
  const firstWord = project.words[0]

  return (
    <section style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>Project state (Step 2 proof)</h1>
      <ul>
        <li>id: {project.id}</li>
        <li>presetId: {project.presetId}</li>
        <li>words: {project.words.length}</li>
        <li>overlays: {project.overlays.length}</li>
      </ul>

      {firstWord && (
        <p>
          First word: "{firstWord.text}" — emphasis: {String(firstWord.emphasis)}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!firstWord}
          onClick={() =>
            firstWord &&
            dispatch({
              type: 'UPDATE_WORD',
              wordId: firstWord.id,
              patch: { emphasis: !firstWord.emphasis },
            })
          }
        >
          Toggle first word emphasis
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_PRESET', presetId: 'mrbeast' })}
        >
          Set preset: mrbeast
        </button>
        <button type="button" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => dispatch({ type: 'REDO' })}>
          Redo
        </button>
      </div>
    </section>
  )
}

export default App
