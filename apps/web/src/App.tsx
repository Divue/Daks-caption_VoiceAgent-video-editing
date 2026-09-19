import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentActivityPanel } from '@/components/agent/AgentActivityPanel'
import { AgentCommandBar } from '@/components/agent/AgentCommandBar'
import { CaptionStylePanel } from '@/components/inspector/CaptionStylePanel'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
import { VideoStage } from '@/components/preview/VideoStage'
import { PresetPicker } from '@/components/presets/PresetPicker'
import { CollapsiblePanel } from '@/components/shell/CollapsiblePanel'
import { Timeline } from '@/components/timeline/Timeline'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { resolveEmphasis } from '@captions/shared'
import type { CaptionBlock, Emotion, Word } from '@captions/shared'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { useAgentCommand } from '@/hooks/useAgentCommand'
import type { TransportOutcome } from '@/hooks/useAgentCommand'
import { getProject } from '@/lib/api'
import { resolveTransport } from '@/lib/voice-intents'
import type { TransportIntent } from '@/lib/voice-intents'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { findBlockIndexAt, useCaptionBlocks } from '@/hooks/useCaptionBlocks'
import { useSelection } from '@/hooks/useSelection'
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts'
import type { SelectionContext } from '@/lib/agent-api'
import { usePlayback } from '@/state/playback-context'
import { usePresetOverride } from '@/state/preset-override-context'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'
import { useWordPatch } from '@/state/word-patch-context'

/** How long the video stays turned down after the user stops speaking. */
const DUCK_RELEASE_MS = 900

function App() {
  const { project, dispatch } = useProject()
  const { localPreviewUrl, projectId } = useSync()
  const playback = usePlayback()
  const { timeMs, isPlaying, seek } = playback
  // The player's newest state, readable from callbacks that must not be re-created 60 times a
  // second (the playhead is state). Assigned in an effect for the same reason as stopVoiceRef.
  const playbackRef = useRef(playback)
  useEffect(() => {
    playbackRef.current = playback
  })
  const { selectedWordId, select } = useSelection()
  const activity = useAgentActivity()
  const { entries, addEntry } = activity
  const { patch: patchWord, patchWords } = useWordPatch()
  const { preset } = usePresetOverride()

  // A view preference, not project data: local state, never Project.settings (a schema
  // change) and never the reducer (it would land in the undo history).
  const [mergeShort, setMergeShort] = useState(true)
  const [revealBlockId, setRevealBlockId] = useState<string | null>(null)

  const { blocks, wordsOf } = useCaptionBlocks(mergeShort)

  // Which words RENDER emphasised: the pipeline's own plus the rhythm rule's promotions. Computed
  // once here and handed to both the preview and the caption list, so the two can never disagree
  // about which word is the big one.
  const emphasis = useMemo(
    () => resolveEmphasis(project.words, blocks, preset.emphasisEveryBlocks),
    [project.words, blocks, preset.emphasisEveryBlocks],
  )

  const activeBlockIndex = findBlockIndexAt(blocks, timeMs)
  const activeBlockId = activeBlockIndex === -1 ? null : blocks[activeBlockIndex].id

  useUndoRedoShortcuts()

  // The mic and the turn runner each need the other: the runner must be able to stop
  // listening when you say "that's all", and the mic must hand transcripts to the runner. A
  // ref breaks the cycle without making either of them re-create itself every render.
  const stopVoiceRef = useRef<() => void>(() => {})
  const stopListening = useCallback(() => stopVoiceRef.current(), [])

  // "Play", "pause", "go to 5 seconds": the editor's own player, answered here rather than by a
  // model with no playback tool. `resolveTransport` is pure and tested; this only applies it.
  const handleTransport = useCallback(async (intent: TransportIntent): Promise<TransportOutcome> => {
    const p = playbackRef.current
    const { action, label } = resolveTransport(intent, { timeMs: p.timeMs, durationMs: p.durationMs, rate: p.rate })
    switch (action.kind) {
      case 'play': {
        const result = await p.play()
        return result.ok ? { ok: true, label } : { ok: false, label: `Couldn’t play — ${result.reason}` }
      }
      case 'pause':
        p.pause()
        return { ok: true, label }
      case 'seek': {
        p.seek(action.ms)
        if (action.thenPlay) {
          const result = await p.play()
          if (!result.ok) return { ok: false, label: `Went back to the start, but couldn’t play — ${result.reason}` }
        }
        return { ok: true, label }
      }
      case 'rate':
        p.setRate(action.rate)
        return { ok: true, label }
      case 'mute':
        return p.setMuted(action.muted)
          ? { ok: true, label }
          : { ok: false, label: 'No video loaded yet' }
      case 'none':
        return { ok: true, label }
    }
  }, [])

  const isVideoPlaying = useCallback(() => playbackRef.current.isPlaying, [])
  const agent = useAgentCommand(activity, stopListening, handleTransport, isVideoPlaying)

  // A fresh presigned link for the same file, for when the one the player holds has expired. Only
  // the link is taken from the response: swapping the whole project here would fight the edit queue.
  const getFreshVideoUrl = useCallback(async (): Promise<string | null> => {
    if (!projectId) return null
    const { project: latest } = await getProject(projectId)
    return latest.videoUrl ?? null
  }, [projectId])

  /**
   * Everything the editor knows about what the user is pointing at, resolved at send time.
   *
   * The active block is resolved to WORD IDS here rather than sent as an index: blocks are
   * derived from word timings and their indices shift as you edit, so an index would be stale by
   * the time the model used it (audit 17 §2). Word ids are the only stable handle.
   */
  const buildSelection = useCallback(
    (): SelectionContext => ({
      selectedWordId,
      selectedWordIds: selectedWordId ? [selectedWordId] : null,
      playheadMs: Math.max(0, Math.round(timeMs)),
      activeBlockId,
      activeBlockWordIds: activeBlockIndex === -1 ? null : blocks[activeBlockIndex].wordIds,
    }),
    [selectedWordId, timeMs, activeBlockId, activeBlockIndex, blocks],
  )

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      void agent.run(transcript, buildSelection(), 'voice')
    },
    [agent, buildSelection],
  )

  const voice = useVoiceInput(handleVoiceTranscript)
  // Assigned in an effect, not during render: a ref written while rendering is read by
  // whatever runs first, and React can discard a render pass entirely.
  useEffect(() => {
    stopVoiceRef.current = voice.stop
  }, [voice.stop])

  // The mic reports transport state; the agent reports whether it is working. Showing them as
  // one control is a VIEW concern and is derived here, so neither side can leave the other
  // stuck in a state it has no way to clear.
  const micStatus: MicStatus = agent.busy && voice.status === 'listening' ? 'processing' : voice.status

  // The newest outcome, while it is still news. The command bar decides how long to keep showing it.
  const latestEntry = entries.at(-1)
  const flash =
    latestEntry && (latestEntry.status === 'ok' || latestEntry.status === 'warn' || latestEntry.status === 'info')
      ? { id: latestEntry.id, text: latestEntry.message, tone: latestEntry.status }
      : null

  // One definition of "the mic is on", shared by the button, the Stop link and Esc, so they can
  // never disagree about whether there is anything to stop. `connecting` counts: a start still
  // in flight is exactly what someone clicks again to cancel.
  const micIsOn = voice.status === 'listening' || voice.status === 'connecting'

  const stopVoice = useCallback(() => {
    voice.stop()
    addEntry('Voice input stopped')
  }, [voice, addEntry])

  // Turn the video down only WHILE THE USER IS SPEAKING, so their voice is not buried under the
  // clip's narration, and back up a moment after they stop.
  //
  // This used to duck for as long as the mic was OPEN. A voice session can stay open the whole time
  // someone is editing, so the video sat at a quarter of its volume for the entire session — and on
  // Windows the system turns other audio down further while any app has a microphone open. "I can't
  // hear the video" was the result. An interim transcript is the signal that someone is talking.
  const { duck } = playback
  const speaking = voice.interim !== null
  useEffect(() => {
    if (speaking) {
      duck(true)
      return
    }
    // A short hold, so a brief gap between two words doesn't make the video pump up and down.
    const timer = setTimeout(() => duck(false), DUCK_RELEASE_MS)
    return () => clearTimeout(timer)
  }, [speaking, duck])
  // Whatever happens — the mic closing mid-sentence, this component going away — the volume the
  // user chose comes back.
  useEffect(() => () => duck(false), [duck])

  // Space plays and pauses, as it does in every video tool — the agent even tells people to use
  // it. Ignored while typing, and on controls that already use Space themselves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) ||
          // Radix renders its menus and selects as divs, so the tagName test above misses them:
          // with a Select open, Space is how you pick the focused option, not play/pause.
          target.closest(
            '[role="tab"],[role="slider"],[role="switch"],[role="checkbox"],' +
              '[role="listbox"],[role="option"],[role="combobox"],[role="menu"],[role="menuitem"],[role="dialog"]',
          ))
      ) {
        return
      }
      event.preventDefault()
      playbackRef.current.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Esc ends a voice session from anywhere — including while typing, since the one thing Esc
  // should never mean while the mic is open is "keep listening".
  useEffect(() => {
    if (!micIsOn) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stopVoice()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [micIsOn, stopVoice])

  function handleToggleMic() {
    if (micIsOn) {
      stopVoice()
      return
    }
    // Which transport actually started is logged, not assumed: LiveKit falls back to the
    // browser's own recognition when it is not configured, and the log must not imply we are
    // running a service we are not.
    void voice.start().then((result) => {
      if (result === 'livekit') addEntry('Listening (LiveKit)')
      else if (result === 'browser') addEntry('Listening (browser speech recognition)')
      else if (result === 'denied') addEntry('Microphone blocked by the browser', 'error')
      // Stopped before it finished connecting: the stop was already logged, say nothing more.
      else if (result === 'cancelled') return
      else addEntry('No microphone transport available', 'error')
    })
  }

  function handleSubmitCommand(command: string) {
    void agent.run(command, buildSelection(), 'text')
  }

  /** Dispatches the same UNDO the toolbar and Ctrl+Z use — one history, one mechanism. */
  // The agent's reply is the thing you want to see the moment you ask for something — and in
  // a voice-first product you are not looking at the panel when you start talking. Switching
  // on the first turn only: after that the user's own choice of tab is theirs to keep.
  const [rightTab, setRightTab] = useState('inspector')
  const hasShownAgent = useRef(false)
  useEffect(() => {
    if (agent.busy && !hasShownAgent.current) {
      hasShownAgent.current = true
      setRightTab('agent')
    }
  }, [agent.busy])

  const handleUndoTurn = useCallback(
    (steps: number) => {
      for (let i = 0; i < steps; i += 1) dispatch({ type: 'UNDO' })
    },
    [dispatch],
  )

  // Emotion is stored per WORD; a "line emotion" is just the same value written onto every
  // word of that line. There is no lines[] in the schema (blocks are derived), so this is the
  // whole of it — and because deriveBlocks breaks on a tone change, the line stays one block.
  const handleSetBlockEmotion = useCallback(
    (block: CaptionBlock, emotion: Emotion) => {
      patchWords(block.wordIds, { emotion })
    },
    [patchWords],
  )

  // One word, which by design splits its line into up to three blocks (deriveBlocks rule 3).
  const handleSetWordEmotion = useCallback(
    (word: Word, emotion: Emotion) => {
      patchWord(word.id, { emotion })
    },
    [patchWord],
  )

  const handleSetWordSingle = useCallback(
    (word: Word, single: boolean) => {
      patchWord(word.id, { single })
    },
    [patchWord],
  )

  // Emphasis is the single biggest visual lever these presets have, so it is editable straight
  // from the caption list rather than only from the inspector — same place tone already is.
  const handleSetWordEmphasis = useCallback(
    (word: Word, emphasis: boolean) => {
      patchWord(word.id, { emphasis })
    },
    [patchWord],
  )

  // Clicking a caption row both seeks and asks the timeline to scroll that block into view.
  const handleSeekToBlock = useCallback(
    (block: { id: string; startMs: number }) => {
      seek(block.startMs)
      setRevealBlockId(block.id)
    },
    [seek],
  )

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader projectId={project.id} />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <CollapsiblePanel name="captions" side="left" title="captions" width="lg:w-[340px] w-full">
              <TranscriptPanel
                blocks={blocks}
                wordsOf={wordsOf}
                activeBlockId={activeBlockId}
                selectedWordId={selectedWordId}
                onSelectWord={select}
                onSeekToBlock={handleSeekToBlock}
                followPlayhead={isPlaying}
                mergeShort={mergeShort}
                onMergeShortChange={setMergeShort}
                onSetBlockEmotion={handleSetBlockEmotion}
                onSetWordEmotion={handleSetWordEmotion}
                onSetWordSingle={handleSetWordSingle}
                onSetWordEmphasis={handleSetWordEmphasis}
                emphasisIds={emphasis.ids}
                promotedEmphasisIds={emphasis.promoted}
              />
            </CollapsiblePanel>

            <section className="flex min-h-[320px] min-w-0 flex-1 flex-col lg:min-h-0">
              <VideoStage
                src={localPreviewUrl ?? project.videoUrl}
                getFreshSrc={getFreshVideoUrl}
                width={project.width}
                height={project.height}
                captionLayer={(frameWidth) => (
                  <CaptionRenderer
                    blocks={blocks}
                    wordsOf={wordsOf}
                    project={project}
                    preset={preset}
                    emphasisIds={emphasis.ids}
                    timeMs={timeMs}
                    frameWidth={frameWidth}
                    selectedWordId={selectedWordId}
                  />
                )}
              />
            </section>

            <CollapsiblePanel
              name="stylePanel"
              side="right"
              title="style panel"
              width="lg:w-[340px] w-full"
              bare
            >
              <Tabs
                value={rightTab}
                onValueChange={setRightTab}
                className="flex h-full min-h-0 flex-col gap-0"
              >
                <TabsList className="h-9 w-full shrink-0 justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
                  {/* Underline tabs, per DESIGN.md's segmented-tab: the active one is marked by a
                      2px primary rule, not a filled pill. */}
                  {[
                    ['inspector', 'Style'],
                    ['presets', 'Presets'],
                    ['agent', 'Activity'],
                  ].map(([value, label]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="eyebrow h-9 rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="inspector" className="min-h-0 flex-1 overflow-hidden">
                  <CaptionStylePanel selectedWordId={selectedWordId} />
                </TabsContent>
                <TabsContent value="presets" className="min-h-0 flex-1 overflow-y-auto">
                  <PresetPicker />
                </TabsContent>
                <TabsContent value="agent" className="min-h-0 flex-1 overflow-y-auto">
                  <AgentActivityPanel
                    entries={entries}
                    busy={agent.busy}
                    micStatus={micStatus}
                    onUndoTurn={handleUndoTurn}
                  />
                </TabsContent>
              </Tabs>
            </CollapsiblePanel>
          </div>

          <Timeline
            durationMs={project.durationMs}
            width={project.width}
            height={project.height}
            blocks={blocks}
            wordsOf={wordsOf}
            emphasisIds={emphasis.ids}
            activeBlockId={activeBlockId}
            selectedWordId={selectedWordId}
            onSelectWord={select}
            revealBlockId={revealBlockId}
          />
        </main>

        <AgentCommandBar
          micStatus={micStatus}
          busy={agent.busy}
          awaitingQuestion={agent.awaitingAnswer?.question ?? null}
          onDismissQuestion={agent.dismissQuestion}
          pendingCommand={agent.pendingCommand}
          interimTranscript={voice.interim}
          flash={flash}
          onToggleMic={handleToggleMic}
          onStopMic={stopVoice}
          onSubmitCommand={handleSubmitCommand}
          onCancel={agent.cancel}
        />
      </div>
    </div>
  )
}

export default App
