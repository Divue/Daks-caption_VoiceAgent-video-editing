import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Panel collapse state lives in the URL, so a layout survives a reload and can be linked.
 * Written with replaceState: it is a view preference, not a navigation, and should not
 * add history entries the back button has to walk through.
 */
function useUrlFlag(name: string): [boolean, (value: boolean) => void] {
  const read = useCallback(() => new URLSearchParams(window.location.search).get(name) === 'collapsed', [name])
  const [collapsed, setCollapsed] = useState(read)

  useEffect(() => {
    const onPop = () => setCollapsed(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [read])

  const set = useCallback(
    (value: boolean) => {
      const params = new URLSearchParams(window.location.search)
      if (value) params.set(name, 'collapsed')
      else params.delete(name)
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
      setCollapsed(value)
    },
    [name],
  )

  return [collapsed, set]
}

interface CollapsiblePanelProps {
  /** URL parameter that holds this panel's state, e.g. "stylePanel". */
  name: string
  side: 'left' | 'right'
  title: string
  width?: string
  children: ReactNode
  className?: string
}

export function CollapsiblePanel({
  name,
  side,
  title,
  width = 'w-[320px]',
  children,
  className,
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useUrlFlag(name)

  // The chevron points the way the panel will move.
  const Chevron = (side === 'left') === collapsed ? ChevronRight : ChevronLeft

  const handle = (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      aria-expanded={!collapsed}
      title={collapsed ? `Show ${title}` : `Hide ${title}`}
      className={cn(
        'group flex w-3 shrink-0 items-center justify-center border-border bg-background transition-colors hover:bg-accent',
        side === 'left' ? 'border-r' : 'border-l',
      )}
    >
      <Chevron className="size-3 text-muted-foreground group-hover:text-foreground" />
      <span className="sr-only">{collapsed ? `Show ${title}` : `Hide ${title}`}</span>
    </button>
  )

  return (
    <>
      {side === 'right' && handle}
      <section
        className={cn(
          'flex min-h-0 flex-col overflow-hidden bg-background transition-[width]',
          collapsed ? 'w-0 border-0' : width,
          side === 'left' ? 'border-r' : 'border-l',
          collapsed && 'pointer-events-none',
          className,
        )}
        aria-hidden={collapsed}
      >
        {!collapsed && children}
      </section>
      {side === 'left' && handle}
    </>
  )
}
