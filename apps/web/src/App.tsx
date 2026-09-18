import { useCallback, useState } from 'react'
import { AgentActivityPanel } from '@/components/agent/AgentActivityPanel'
import { AgentCommandBar } from '@/components/agent/AgentCommandBar'
import { WordInspector } from '@/components/inspector/WordInspector'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
import { VideoStage } from '@/components/preview/VideoStage'
import { PresetPicker } from '@/components/presets/PresetPicker'
import { CollapsiblePanel } from '@/components/shell/CollapsiblePanel'
import { Timeline } from '@/components/timeline/Timeline'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { useLiveKitVoice } from '@/hooks/useLiveKitVoice'
import { findBlockIndexAt, useCaptionBlocks } from '@/hooks/useCaptionBlocks'
import { useSelection } from '@/hooks/useSelection'
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts'
import type { AgentCommandResponse } from '@/lib/agent-client'
import { submitTextCommand, submitVoiceTranscript } from '@/lib/agent-client'
import { usePlayback } from '@/state/playback-context'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'


function App() {
const { project, dispatch } = useProject()
const { localPreviewUrl } = useSync()
const { timeMs, isPlaying, seek } = usePlayback()
const { selectedWordId, select } = useSelection()
const { entries, addEntry, addBackendEntries } = useAgentActivity()

const [mergeShort, setMergeShort] = useState(true)
const [revealBlockId, setRevealBlockId] = useState<string | null>(null)

const { blocks, wordsOf } = useCaptionBlocks(mergeShort)
const activeBlockIndex = findBlockIndexAt(blocks, timeMs)
const activeBlockId = activeBlockIndex === -1 ? null : blocks[activeBlockIndex].id
  useUndoRedoShortcuts()

  // Applies an AgentCommandResponse exactly as services/api/app/agent's own
  // contract intends: every patch dispatched, in order, through the SAME
  // project-reducer actions already used for direct user edits (no separate
  // "agent apply" path), plus the backend's own log entries appended as-is.
  function applyAgentResponse(response: AgentCommandResponse) {
    for (const patch of response.patches) {
      dispatch(patch)
    }
    addBackendEntries(response.log)
  }

  async function handleSubmitCommand(command: string) {
    try {
      const response = await submitTextCommand(command, project, { selectedWordId })
      applyAgentResponse(response)
    } catch (error) {
      console.error('handleSubmitCommand failed', error)
      addEntry(`Command failed: "${command}" (${error instanceof Error ? error.message : 'unknown error'})`)
    }
  }

  async function handleVoiceTranscript(transcript: string) {
    try {
      const response = await submitVoiceTranscript(transcript, project, { selectedWordId })
      applyAgentResponse(response)
    } catch (error) {
      console.error('handleVoiceTranscript failed', error)
      addEntry(`Voice command failed: "${transcript}" (${error instanceof Error ? error.message : 'unknown error'})`)
    }
  }

  const { status: micStatus, start: startVoice, stop: stopVoice } = useLiveKitVoice(handleVoiceTranscript)

  function handleToggleMic() {
    if (micStatus === 'listening' || micStatus === 'processing') {
      stopVoice()
      addEntry('Voice input stopped')
    } else {
      addEntry('Voice input started')
      void startVoice()
    }
  }

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
                  <TabsTrigger value="inspector">Inspector</TabsTrigger>
                  <TabsTrigger value="presets">Presets</TabsTrigger>
                  <TabsTrigger value="agent">Agent Log</TabsTrigger>
                </TabsList>

                <TabsContent value="inspector" className="min-h-0 flex-1 overflow-y-auto">
                  <WordInspector selectedWordId={selectedWordId} />
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
