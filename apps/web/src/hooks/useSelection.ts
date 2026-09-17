import { useCallback, useState } from 'react'

/** Tracks the currently selected word id; selecting the same id again clears it. */
export function useSelection() {
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null)

  const select = useCallback((wordId: string) => {
    setSelectedWordId((current) => (current === wordId ? null : wordId))
  }, [])

  return { selectedWordId, select }
}
