import { PanelPlaceholder } from '@/components/layout/PanelPlaceholder'
import { UndoRedoControls } from '@/components/layout/UndoRedoControls'
import { WordInspector } from '@/components/inspector/WordInspector'
import { PlayerPlaceholder } from '@/components/player/PlayerPlaceholder'
import { PresetPicker } from '@/components/presets/PresetPicker'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { useSelection } from '@/hooks/useSelection'
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts'
import { useProject } from '@/state/project-context'

function App() {
  const { project } = useProject()
  const { selectedWordId, select } = useSelection()
  useUndoRedoShortcuts()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Expressive Captions</h1>
          <p className="text-sm text-muted-foreground">{project.id}</p>
        </div>
        <UndoRedoControls />
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
        <section className="flex min-h-64 flex-col gap-3 lg:h-full lg:w-1/2 lg:min-h-0">
          <div className="min-h-0 flex-1">
            <PlayerPlaceholder />
          </div>
          <UploadDropzone />
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <Tabs defaultValue="transcript" className="flex h-full flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="inspector">Inspector</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="agent">Agent Log</TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="min-h-0 overflow-y-auto rounded-md border">
              <TranscriptPanel selectedWordId={selectedWordId} onSelectWord={select} />
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 overflow-y-auto rounded-md border">
              <WordInspector selectedWordId={selectedWordId} />
            </TabsContent>
            <TabsContent value="presets" className="min-h-0 overflow-y-auto rounded-md border">
              <PresetPicker />
            </TabsContent>
            <TabsContent value="agent" className="min-h-0 overflow-y-auto rounded-md border">
              <PanelPlaceholder
                title="Agent log"
                description="Mic input and agent steps — coming in Step 9."
              />
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  )
}

export default App
