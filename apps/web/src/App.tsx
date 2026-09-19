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

function App() {
  const { project, dispatch } = useProject()
  const { localPreviewUrl } = useSync()
  const { timeMs, isPlaying, seek } = usePlayback()
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
  const agent = useAgentCommand(activity, stopListening)

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

  // One definition of "the mic is on", shared by the button, the Stop link and Esc, so they can
  // never disagree about whether there is anything to stop. `connecting` counts: a start still
  // in flight is exactly what someone clicks again to cancel.
  const micIsOn = voice.status === 'listening' || voice.status === 'connecting'

  const stopVoice = useCallback(() => {
    voice.stop()
    addEntry('Voice input stopped')
  }, [voice, addEntry])

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
