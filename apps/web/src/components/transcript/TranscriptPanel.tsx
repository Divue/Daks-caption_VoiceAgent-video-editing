import { useState } from 'react'
import { PanelLabel } from '@/components/layout/PanelLabel'
import { Input } from '@/components/ui/input'
import { useProject } from '@/state/project-context'
import { TranscriptWordRow } from './TranscriptWordRow'

interface TranscriptPanelProps {
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
}

export function TranscriptPanel({ selectedWordId, onSelectWord }: TranscriptPanelProps) {
  const { project } = useProject()
  const [query, setQuery] = useState('')

  const words = query.trim()
    ? project.words.filter((word) => word.text.toLowerCase().includes(query.trim().toLowerCase()))
    : project.words

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-hairline p-3">
        <div className="flex items-baseline justify-between">
          <PanelLabel>Transcript</PanelLabel>
          <span className="font-mono text-[11px] text-faint">{project.words.length} words</span>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search transcript..."
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {words.length === 0 ? (
          <p className="p-2 font-mono text-xs text-faint">No words match "{query}".</p>
        ) : (
          words.map((word) => (
            <TranscriptWordRow
              key={word.id}
              word={word}
              selected={word.id === selectedWordId}
              onSelect={onSelectWord}
            />
          ))
        )}
      </div>
    </div>
  )
}
