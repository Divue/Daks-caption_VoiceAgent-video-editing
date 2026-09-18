import { useState } from 'react'
import { AgentActivityPanel } from '@/components/agent/AgentActivityPanel'
import { AgentCommandBar } from '@/components/agent/AgentCommandBar'
import { WordInspector } from '@/components/inspector/WordInspector'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
import { VideoStage } from '@/components/preview/VideoStage'
import { PresetPicker } from '@/components/presets/PresetPicker'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { findBlockIndexAt, useCaptionBlocks } from '@/hooks/useCaptionBlocks'
import { useSelection } from '@/hooks/useSelection'
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts'
import { usePlayback } from '@/state/playback-context'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'

function App() {
  const { project } = useProject()
  const { localPreviewUrl } = useSync()
  const { timeMs, isPlaying, seek } = usePlayback()
  // View preference, not project data: local state, never Project.settings (plan §3.1).
  const [mergeShort, setMergeShort] = useState(true)
  const { blocks, wordsOf } = useCaptionBlocks(mergeShort)
  const activeBlockIndex = findBlockIndexAt(blocks, timeMs)
  const activeBlockId = activeBlockIndex === -1 ? null : blocks[activeBlockIndex].id
  const { selectedWordId, select } = useSelection()
  const { entries, addEntry } = useAgentActivity()
  const [micStatus, setMicStatus] = useState<MicStatus>('idle')
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

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader projectId={project.id} />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <section className="flex min-h-[420px] flex-col gap-3 p-3 lg:min-h-0 lg:min-w-[420px] lg:flex-1 lg:overflow-hidden">
            <div className="min-h-[300px] flex-1 lg:min-h-0">
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
            </div>
            <UploadDropzone />
          </section>

          <section className="flex min-h-[320px] flex-col border-t lg:min-h-0 lg:w-[340px] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-l">
            <TranscriptPanel
              blocks={blocks}
              wordsOf={wordsOf}
              activeBlockId={activeBlockId}
              selectedWordId={selectedWordId}
              onSelectWord={select}
              onSeekToBlock={(block) => seek(block.startMs)}
              followPlayhead={isPlaying}
              mergeShort={mergeShort}
              onMergeShortChange={setMergeShort}
            />
          </section>

          <section className="flex min-h-[320px] flex-col border-t lg:min-h-0 lg:w-[300px] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-l">
            <Tabs defaultValue="inspector" className="flex h-full min-h-0 flex-col">
              <TabsList className="grid w-full grid-cols-3">
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
          </section>
        </main>

        <AgentCommandBar micStatus={micStatus} onToggleMic={handleToggleMic} onSubmitCommand={handleSubmitCommand} />
      </div>
    </div>
  )
}

export default App
