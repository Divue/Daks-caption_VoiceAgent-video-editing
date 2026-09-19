import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError, isApiError } from '@/lib/api'
import { submitTextCommand, submitVoiceTranscript } from '@/lib/agent-api'
import type { ActivePreset, ClarificationTurn, SelectionContext } from '@/lib/agent-api'
import { summarisePatches, summariseTurn } from '@/lib/agent-summary'
import { usePresetOverride } from '@/state/preset-override-context'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'
import type { useAgentActivity } from '@/hooks/useAgentActivity'

type Activity = ReturnType<typeof useAgentActivity>

/**
 * "Undo that" is handled by the EDITOR, not by a tool.
 *
 * Making it a tool call would put the user's history in the model's hands, cost a Bedrock round
 * trip to press a button we already have, and could not work anyway — the undo stack lives in the
 * browser and the agent has never seen it. Matching locally dispatches the exact same UNDO the
 * toolbar button and Ctrl+Z dispatch, so there is still only one history mechanism (audit 07).
 */
const UNDO_PHRASES = /^(undo( that| it| the last( one)?)?|take that back|revert that|nevermind|never mind)[.!]?$/i
const REDO_PHRASES = /^(redo( that| it)?|put it back)[.!]?$/i

export interface AgentTurnState {
  /** A turn is in flight. The agent may take many tool rounds, so this can last seconds. */
  busy: boolean
  /** What the user said, while it is still running — shown so the bar can echo it back. */
  pendingCommand: string | null
  /**
   * The question the agent is waiting on, if it asked one. The next thing the user says is
   * read as the ANSWER: it goes back with the original request attached, so the agent can
   * finally do the whole thing instead of half of it.
   */
  awaitingAnswer: ClarificationTurn | null
}

export function useAgentCommand(activity: Activity) {
  const { project, dispatch } = useProject()
  const { applyAgentPatches } = useWordPatch()
  // The resolved preset — base + any stored override — so the agent sees the look the user is
  // actually staring at, not the preset id alone.
  const { preset } = usePresetOverride()
  const { addEntry, updateEntry } = activity

  const [state, setState] = useState<AgentTurnState>({
    busy: false,
    pendingCommand: null,
    awaitingAnswer: null,
  })
  // Read inside `run` without making it a dependency, so a pending question cannot go stale
  // between the render that set it and the keystroke that answers it.
  const awaitingRef = useRef<ClarificationTurn | null>(null)
  const historyRef = useRef<ClarificationTurn[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  // The project is read at send time, not at render time, so a turn always posts the newest
  // document even if several commands are fired in a row.
  const projectRef = useRef(project)
  useEffect(() => {
    projectRef.current = project
  }, [project])

  const presetRef = useRef(preset)
  useEffect(() => {
    presetRef.current = preset
  }, [preset])

  useEffect(() => () => controllerRef.current?.abort(), [])

  /**
   * Cancels the in-flight REQUEST only. It deliberately does not cancel the write queue: aborting
   * a client fetch does not cancel a server-side write, and doing so mid-chain sends a version the
   * server has already moved past, which 409s every write after it (audit 13 §5). Patches already
   * enqueued finish and are reported.
   */
  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const run = useCallback(
    async (rawCommand: string, selection: SelectionContext, source: 'text' | 'voice' = 'text') => {
      const command = rawCommand.trim()
      if (!command) return

      if (UNDO_PHRASES.test(command)) {
        dispatch({ type: 'UNDO' })
        addEntry('Undid the last change', 'ok')
        return
      }
      if (REDO_PHRASES.test(command)) {
        dispatch({ type: 'REDO' })
        addEntry('Redid the last change', 'ok')
        return
      }

      // A new utterance supersedes whatever is still in flight — barge-in.
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      // If the agent asked something, this utterance is the answer to it. History accumulates:
      // an agent may need two rounds to pin down a moment ("when?" then "where in the frame?"),
      // and round three has to see both or it is answering in the dark.
      const history: ClarificationTurn[] = [...historyRef.current]

      const entryId = addEntry(command, 'pending')
      updateEntry(entryId, { command })
      setState({ busy: true, pendingCommand: command, awaitingAnswer: null })
      awaitingRef.current = null

      try {
        const request = source === 'voice' ? submitVoiceTranscript : submitTextCommand
        const p = presetRef.current
        const activePreset: ActivePreset = {
          presetId: p.id,
          name: p.name,
          baseColor: p.base.color,
          emphasisColor: p.emphasis?.color,
          emphasisFontFamily: p.emphasis?.fontFamily,
          emotionColors: Object.fromEntries(
            Object.entries(p.emotion ?? {})
              .map(([tone, value]) => [tone, value?.style?.color])
              .filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
          ),
          wordsPerLine: p.wordsPerLine,
        }

        const response = await request(
          command,
          projectRef.current,
          selection,
          history,
          activePreset,
          controller.signal,
        )

        // The backend's log is three different things in one list: an echo of the command, one
        // line per tool call, and the agent's own closing sentence. Showing them undifferentiated
        // buried the actual REPLY as a numbered step — the user could see that six tools ran but
        // not what the agent said it did. Split them here.
        const steps = response.log
          .map((entry) => entry.message)
          .filter((message) => message.startsWith("Tool '"))
        const reply = response.log
          .map((entry) => entry.message)
          .filter((message) => !message.startsWith("Tool '") && !message.startsWith('Command received:'))
          .at(-1)

        if (response.status === 'needs_input' && response.question) {
          // The agent is asking rather than guessing. Remember what it was asked about, so
          // the reply carries the original request with it — otherwise the answer arrives as
          // a standalone command ("at 22 seconds") that means nothing on its own.
          const asked: ClarificationTurn = { command, question: response.question }
          historyRef.current = [...history, asked]
          awaitingRef.current = asked
          setState({ busy: false, pendingCommand: null, awaitingAnswer: asked })
          updateEntry(entryId, { status: 'question', message: response.question, trace: steps })
          return
        }

        if (response.status !== 'ok') {
          // `unsupported` and `not_implemented` are the agent being honest about a capability it
          // does not have. They are not failures and they are not successes — never a green tick.
          updateEntry(entryId, {
            status: response.status === 'error' ? 'error' : 'warn',
            message:
              reply ??
              (response.status === 'error'
                ? 'The agent could not finish that.'
                : 'The editor cannot do that yet.'),
            trace: steps,
          })
          return
        }

        if (response.patches.length === 0) {
          updateEntry(entryId, {
            status: 'warn',
            message: reply ?? 'Nothing changed.',
            trace: steps,
          })
          return
        }

        // The exchange is over: the next utterance starts a fresh conversation.
        historyRef.current = []

        const lines = summarisePatches(response.patches, projectRef.current)
        const result = await applyAgentPatches(response.patches)

        if (result.error) {
          updateEntry(entryId, {
            status: 'error',
            message:
              result.applied > 0
                ? `Applied ${result.applied} of ${result.total} changes, then hit an error. ${result.error}`
                : result.error,
            lines,
            trace: steps,
            undoSteps: result.resynced ? 2 : 1,
          })
          return
        }

        updateEntry(entryId, {
          // The agent's own sentence is the reply; the mechanical count is a subtitle. Showing
          // "51 words changed" as the headline and hiding "Done! …" in the trace told the user
          // what happened to the data but not what the agent thought it did.
          status: 'ok',
          message: reply ?? summariseTurn(response.patches),
          summary: summariseTurn(response.patches),
          lines,
          trace: steps,
          undoSteps: 1,
        })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          updateEntry(entryId, { status: 'info', message: `${command} — cancelled` })
          return
        }
        updateEntry(entryId, {
          status: 'error',
          message: isApiError(cause) ? describeError(cause) : String(cause),
        })
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
        setState((current) =>
          current.awaitingAnswer
            ? { ...current, busy: false, pendingCommand: null }
            : { busy: false, pendingCommand: null, awaitingAnswer: null },
        )
      }
    },
    [addEntry, updateEntry, applyAgentPatches, dispatch],
  )

  /** Drop a pending question — the user moved on rather than answering. */
  const dismissQuestion = useCallback(() => {
    awaitingRef.current = null
    historyRef.current = []
    setState((current) => ({ ...current, awaitingAnswer: null }))
  }, [])

  return { ...state, run, cancel, dismissQuestion }
}
