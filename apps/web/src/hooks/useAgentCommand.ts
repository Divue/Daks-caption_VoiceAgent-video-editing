import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError, isApiError } from '@/lib/api'
import { submitTextCommand, submitVoiceTranscript } from '@/lib/agent-api'
import type { ActivePreset, ClarificationTurn, SelectionContext } from '@/lib/agent-api'
import { summarisePatches, summariseTurn } from '@/lib/agent-summary'
import {
  REDO_PHRASES,
  STOP_LISTENING,
  UNDO_PHRASES,
  isNotACommand,
  isBareTransport,
  mergeUtterances,
  parseTransportIntent,
} from '@/lib/voice-intents'
import type { TransportIntent } from '@/lib/voice-intents'
import type { Preset } from '@captions/shared'
import { usePresetOverride } from '@/state/preset-override-context'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'
import type { useAgentActivity } from '@/hooks/useAgentActivity'

type Activity = ReturnType<typeof useAgentActivity>

/**
 * How long a bare transport opener stays claimable by the words that follow it. Long enough for a
 * real thinking pause mid-sentence, short enough that two deliberate commands in a row are never
 * glued together.
 */
const BARE_TRANSPORT_WINDOW_MS = 4000

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

/**
 * One agent turn, as a small state machine.
 *
 * `requesting` — waiting on the agent. Nothing has been written, so the turn can be replaced
 *   safely: the agent is stateless and only RETURNS patches, which is exactly what makes
 *   aborting it harmless.
 * `applying` — the agent answered and its patches are going onto the project. This stage must
 *   run to completion; aborting a client fetch does not cancel a server-side write, and doing so
 *   mid-chain 409s every write after it (audit 13 §5).
 */
interface Turn {
  id: number
  entryId: string
  command: string
  stage: 'requesting' | 'applying'
  controller: AbortController
  /** Resolves when the turn is over, whatever the outcome. The next turn waits on it. */
  done: Promise<void>
}

function describePreset(p: Preset): ActivePreset {
  return {
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
}

/** What happened when the editor obeyed a playback command — shown as the activity entry. */
export type TransportOutcome = { ok: boolean; label: string }

export function useAgentCommand(
  activity: Activity,
  onStopListening?: () => void,
  /** Runs a playback command ("play", "go to 5 seconds") against the real player. */
  onTransport?: (intent: TransportIntent) => Promise<TransportOutcome> | TransportOutcome,
  /** Whether the video is playing right now — read at send time, not captured at render. */
  isPlaying?: () => boolean,
) {
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

  /**
   * The ONE turn that is current. Every update a turn makes to state or to its history entry is
   * guarded by "am I still the current turn?", so a turn that was replaced or cancelled goes
   * silent instead of overwriting its successor — which is how an aborted turn used to set
   * `busy: false` while the turn that replaced it was still running.
   */
  const turnRef = useRef<Turn | null>(null)
  const nextId = useRef(1)

  /**
   * A bare transport opener ("stop", "play") that was acted on but may turn out to have been the
   * first half of an edit — "stop… making things red". Held for this long so the next final can
   * claim it; after that it was a real command and the words are dropped.
   */
  const bareTransportRef = useRef<{ said: string; at: number; revert: TransportIntent | null } | null>(null)

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

  useEffect(() => () => turnRef.current?.controller.abort(), [])

  const settle = useCallback(() => {
    setState((current) =>
      current.awaitingAnswer
        ? { ...current, busy: false, pendingCommand: null }
        : { busy: false, pendingCommand: null, awaitingAnswer: null },
    )
  }, [])

  /**
   * Stops a turn that has not written anything yet. Returns false when there was nothing to stop
   * — including a turn that is already applying, which must be allowed to finish.
   */
  const cancelRequesting = useCallback(
    (reason: string) => {
      const turn = turnRef.current
      if (!turn || turn.stage !== 'requesting') return false
      turnRef.current = null
      turn.controller.abort()
      updateEntry(turn.entryId, {
        status: 'info',
        message: reason,
        command: turn.command,
      })
      settle()
      return true
    },
    [updateEntry, settle],
  )

  /** The Cancel button. Same rules as saying "never mind" out loud. */
  const cancel = useCallback(() => {
    cancelRequesting('Cancelled — nothing was changed')
  }, [cancelRequesting])

  const run = useCallback(
    async (rawCommand: string, selection: SelectionContext, source: 'text' | 'voice' = 'text') => {
      let said = rawCommand.trim()
      if (!said) return

      // A live mic produces speech that was never aimed at us. Filter it BEFORE anything else,
      // so throat-clearing mid-turn can neither start a turn nor interrupt the one running.
      if (source === 'voice') {
        if (isNotACommand(said)) {
          addEntry(`Ignored “${said}” — that did not sound like a command`, 'info')
          return
        }
        // Stops the microphone, not the agent: the turn in flight still finishes.
        if (STOP_LISTENING.test(said.replace(/[.,!?]/g, '').trim())) {
          onStopListening?.()
          addEntry('Stopped listening', 'info')
          return
        }
      }

      // Any deliberate utterance consumes a pending opener (below); only filler leaves it alone,
      // because "stop … um … making things red" is still one sentence.
      const pendingBare = bareTransportRef.current
      bareTransportRef.current = null

      // "Never mind" while the agent is still working means STOP THAT — not "revert my last
      // finished edit". Dispatching UNDO here used to throw away the previous change and then let
      // the in-flight one land anyway: the opposite of both things the user wanted.
      if (UNDO_PHRASES.test(said)) {
        if (cancelRequesting('Cancelled — nothing was changed')) return
        dispatch({ type: 'UNDO' })
        addEntry('Undid the last change', 'ok')
        return
      }
      if (REDO_PHRASES.test(said)) {
        dispatch({ type: 'REDO' })
        addEntry('Redid the last change', 'ok')
        return
      }

      // The video's own controls belong to the editor, not to a model that has no playback tool:
      // asking Bedrock to "play the video" cost ~8 s and came back "I can't control playback".
      // It touches no agent turn in flight, so it can be said while the agent is still working.
      //
      // TWO things it must not steal:
      //  - An ANSWER to the agent's own question. "How much bigger?" → "double" is a size, not a
      //    playback speed, and acting on it also leaves the question hanging forever.
      //  - The first half of an edit. See `bareTransportRef` below.
      const transport =
        onTransport && !awaitingRef.current
          ? parseTransportIntent(said, { playing: isPlaying?.(), misheard: source === 'voice' })
          : null

      if (transport && onTransport) {
        const wasPlaying = isPlaying?.() ?? false
        const outcome = await onTransport(transport)
        addEntry(outcome.label, outcome.ok ? 'ok' : 'warn')
        // A bare opener is provisional: it is exactly what a mid-sentence pause looks like. Keep
        // the words (and how to undo what we just did) in case the rest of the sentence follows.
        if (source === 'voice' && isBareTransport(said)) {
          const revert: TransportIntent | null =
            transport.type === 'play' || transport.type === 'pause'
              ? { type: wasPlaying ? 'play' : 'pause' }
              : null
          bareTransportRef.current = { said, at: Date.now(), revert }
        }
        return
      }

      // Not a transport — so if a bare opener is still warm, this is the rest of its sentence.
      // Put the player back the way it was and carry the opener into the command, which is what
      // would have happened if the recogniser had not called the pause a full stop.
      if (pendingBare && Date.now() - pendingBare.at <= BARE_TRANSPORT_WINDOW_MS) {
        said = mergeUtterances(pendingBare.said, said)
        if (pendingBare.revert && onTransport) await onTransport(pendingBare.revert)
      }

      // --- who owns this utterance? ---------------------------------------------------------
      // A turn that is APPLYING has an answer and is writing it; it cannot be merged into and
      // must not be aborted. Wait for it, then decide — on top of the document it produced. The
      // decision is made only AFTER the wait, with no await between it and claiming the turn,
      // so two utterances that both arrived during one write end up as one merged turn rather
      // than two racing turns, one of which would leave its entry stuck on "pending" forever.
      for (let busyTurn = turnRef.current; busyTurn?.stage === 'applying'; busyTurn = turnRef.current) {
        await busyTurn.done
      }

      const previous = turnRef.current
      let command = said
      let entryId: string

      if (previous && previous.stage === 'requesting') {
        // Barge-in while the agent is still thinking. The earlier words were NOT a finished
        // command — the user paused, the recogniser called it a sentence, and the agent started.
        // Replacing it with only the new words threw the first instruction away ("increase the
        // white font" was lost and only "from 10 s to 12 s" reached the agent). Continue it.
        command = mergeUtterances(previous.command, said)
        entryId = previous.entryId
        turnRef.current = null // the old turn goes silent from here on
        previous.controller.abort()
        updateEntry(entryId, { message: command, command, status: 'pending' })
      } else {
        entryId = addEntry(said, 'pending')
        updateEntry(entryId, { command: said })
      }

      const history: ClarificationTurn[] = [...historyRef.current]
      const controller = new AbortController()
      let finish: () => void = () => {}
      const done = new Promise<void>((resolve) => {
        finish = resolve
      })
      const turn: Turn = { id: nextId.current++, entryId, command, stage: 'requesting', controller, done }
      turnRef.current = turn
      awaitingRef.current = null
      setState({ busy: true, pendingCommand: command, awaitingAnswer: null })

      const isCurrent = () => turnRef.current === turn

      try {
        const request = source === 'voice' ? submitVoiceTranscript : submitTextCommand
        const response = await request(
          command,
          projectRef.current,
          selection,
          history,
          describePreset(presetRef.current),
          controller.signal,
        )
        // Replaced or cancelled while the agent was answering: its answer is to a question the
        // user no longer asked.
        if (!isCurrent()) return

        // The backend's log is three different things in one list: an echo of the command, one
        // line per tool call, and the agent's own closing sentence. Showing them undifferentiated
        // buried the actual REPLY as a numbered step. Split them here.
        const messages = response.log.map((entry) => entry.message)
        const steps = messages.filter((message) => message.startsWith("Tool '"))
        const reply = messages
          .filter((message) => !message.startsWith("Tool '") && !message.startsWith('Command received:'))
          .at(-1)

        if (response.status === 'needs_input' && response.question) {
          // The agent is asking rather than guessing. Remember what it was asked about, so the
          // reply carries the original request with it.
          const asked: ClarificationTurn = { command, question: response.question }
          historyRef.current = [...history, asked]
          awaitingRef.current = asked
          turnRef.current = null
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
          updateEntry(entryId, { status: 'warn', message: reply ?? 'Nothing changed.', trace: steps })
          return
        }

        // The exchange is over: the next utterance starts a fresh conversation.
        historyRef.current = []

        // From here the turn is writing. It can no longer be replaced or cancelled — the next
        // utterance will wait for it instead.
        turn.stage = 'applying'
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
          // The agent's own sentence is the reply; the mechanical count is a subtitle.
          status: 'ok',
          message: reply ?? summariseTurn(response.patches),
          summary: summariseTurn(response.patches),
          lines,
          trace: steps,
          undoSteps: 1,
        })
      } catch (cause) {
        // An abort is always deliberate — a merge or a cancel — and whoever aborted already
        // wrote the entry. Saying "cancelled" here was a false history for a continued turn.
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (!isCurrent()) return
        updateEntry(entryId, {
          status: 'error',
          message: isApiError(cause) ? describeError(cause) : String(cause),
        })
      } finally {
        finish()
        // Only the CURRENT turn may say the agent is idle. A replaced turn reaching this line
        // used to clear `busy` while its successor was still running.
        if (isCurrent()) {
          turnRef.current = null
          settle()
        }
      }
    },
    [addEntry, updateEntry, applyAgentPatches, dispatch, onStopListening, onTransport, isPlaying, cancelRequesting, settle],
  )

  /** Drop a pending question — the user moved on rather than answering. */
  const dismissQuestion = useCallback(() => {
    awaitingRef.current = null
    historyRef.current = []
    setState((current) => ({ ...current, awaitingAnswer: null }))
  }, [])

  return { ...state, run, cancel, dismissQuestion }
}
