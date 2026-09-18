import { useCallback, useState } from 'react'
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
import type { CaptionBlock, Emotion, Word } from '@captions/shared'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { findBlockIndexAt, useCaptionBlocks } from '@/hooks/useCaptionBlocks'
import { useSelection } from '@/hooks/useSelection'
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts'
import { usePlayback } from '@/state/playback-context'
import { usePresetOverride } from '@/state/preset-override-context'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'
import { useWordPatch } from '@/state/word-patch-context'

function App() {
  const { project } = useProject()
  const { localPreviewUrl } = useSync()
  const { timeMs, isPlaying, seek } = usePlayback()
  const { selectedWordId, select } = useSelection()
  const { entries, addEntry } = useAgentActivity()
  const { patch: patchWord, patchWords } = useWordPatch()
  const { preset } = usePresetOverride()
  const [micStatus, setMicStatus] = useState<MicStatus>('idle')

  // A view preference, not project data: local state, never Project.settings (a schema
  // change) and never the reducer (it would land in the undo history).
  const [mergeShort, setMergeShort] = useState(true)
  const [revealBlockId, setRevealBlockId] = useState<string | null>(null)

  const { blocks, wordsOf } = useCaptionBlocks(mergeShort)
  const activeBlockIndex = findBlockIndexAt(blocks, timeMs)
  const activeBlockId = activeBlockIndex === -1 ? null : blocks[activeBlockIndex].id

  useUndoRedoShortcuts()

  function handleToggleMic() {
    setMicStatus((current) => {
      const next: MicStatus = current === 'listening' ? 'idle' : 'listening'
      addEntry(next === 'listening' ? 'Voice input started' : 'Voice input stopped')
      return next
    })
  }

  function handleSubmitCommand(command: string) {
    addEntry(`Command submitted: "${command}" (agent not connected yet)`)
  }

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

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              />
            </CollapsiblePanel>

            <section className="flex min-h-[320px] min-w-0 flex-1 flex-col p-3 lg:min-h-0">
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
                    timeMs={timeMs}
                    frameWidth={frameWidth}
                    selectedWordId={selectedWordId}
                  />
                )}
              />
            </section>

            <CollapsiblePanel name="stylePanel" side="right" title="style panel" width="lg:w-[320px] w-full">
              <Tabs defaultValue="inspector" className="flex h-full min-h-0 flex-col">
                <TabsList className="grid w-full shrink-0 grid-cols-3">
                  <TabsTrigger value="inspector">Style</TabsTrigger>
                  <TabsTrigger value="presets">Presets</TabsTrigger>
                  <TabsTrigger value="agent">Agent Log</TabsTrigger>
                </TabsList>

                <TabsContent value="inspector" className="min-h-0 flex-1 overflow-hidden">
                  <CaptionStylePanel selectedWordId={selectedWordId} />
                </TabsContent>
                <TabsContent value="presets" className="min-h-0 flex-1 overflow-y-auto">
                  <PresetPicker />
                </TabsContent>
                <TabsContent value="agent" className="min-h-0 flex-1 overflow-y-auto">
                  <AgentActivityPanel entries={entries} />
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
            activeBlockId={activeBlockId}
            selectedWordId={selectedWordId}
            onSelectWord={select}
            revealBlockId={revealBlockId}
          />
        </main>

        <AgentCommandBar micStatus={micStatus} onToggleMic={handleToggleMic} onSubmitCommand={handleSubmitCommand} />
      </div>
    </div>
  )
}

export default App
