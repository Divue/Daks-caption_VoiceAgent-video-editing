import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Small mono section label used across the editor panels (design.md label token, in mono). */
export function PanelLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('font-mono text-[11px] leading-[1.2] tracking-[0.08em] text-faint uppercase', className)}>
      {children}
    </p>
  )
}
