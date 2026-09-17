import { useProject } from '@/state/project-context'
import { TranscriptWordRow } from './TranscriptWordRow'

interface TranscriptPanelProps {
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
}

export function TranscriptPanel({ selectedWordId, onSelectWord }: TranscriptPanelProps) {
  const { project } = useProject()

  return (
    <div className="flex flex-col gap-1 p-2">
      {project.words.map((word) => (
        <TranscriptWordRow
          key={word.id}
          word={word}
          selected={word.id === selectedWordId}
          onSelect={onSelectWord}
        />
      ))}
    </div>
  )
}
