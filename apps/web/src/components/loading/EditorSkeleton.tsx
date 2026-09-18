import { cn } from '@/lib/utils'

function Block({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

/** Transcript placeholder rows: varied word widths so it reads as text, not a grid. */
const ROW_WIDTHS = ['w-24', 'w-14', 'w-20', 'w-10', 'w-28', 'w-16', 'w-12', 'w-24', 'w-20', 'w-14']

/**
 * Fallback while the editor's code loads: the editor's own layout (sidebar, header,
 * player, transcript, inspector, command bar) as shimmering blocks, so the page settles
 * into place instead of popping in from blank. Matches App.tsx's breakpoints.
 */
export function EditorSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading editor" className="fade-in flex h-screen bg-background">
      <aside className="flex w-14 shrink-0 flex-col gap-2 border-r border-hairline bg-sidebar p-2 lg:w-56">
        <div className="flex h-10 items-center gap-2.5 px-1">
          <Block className="size-8 shrink-0 rounded-lg" />
          <Block className="hidden h-3.5 w-28 lg:block" />
        </div>
        {[0, 1, 2, 3].map((item) => (
          <Block key={item} className="h-8 rounded-lg" />
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline px-4">
          <Block className="h-4 w-40" />
          <div className="flex gap-2">
            <Block className="h-8 w-20 rounded-full" />
            <Block className="h-8 w-24 rounded-full" />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="flex flex-1 flex-col gap-3 p-3">
            <div className="flex flex-1 items-center justify-center rounded-[20px] border border-hairline p-6">
              <Block className="aspect-9/16 h-full max-h-[60vh] rounded-2xl" />
            </div>
            <Block className="h-28 rounded-[20px]" />
          </section>

          <section className="hidden flex-col gap-2 border-l border-hairline p-3 lg:flex lg:w-[340px]">
            <Block className="mb-2 h-8 rounded-lg" />
            {ROW_WIDTHS.map((width, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-1.5">
                <Block className="h-3 w-9" />
                <Block className={cn('h-3.5', width)} />
              </div>
            ))}
          </section>

          <section className="hidden flex-col gap-4 border-l border-hairline p-4 lg:flex lg:w-[300px]">
            <Block className="h-9 rounded-full" />
            <Block className="h-5 w-32" />
            {[0, 1, 2, 3].map((item) => (
              <Block key={item} className="h-9 rounded-lg" />
            ))}
          </section>
        </main>

        <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-3">
          <Block className="size-10 shrink-0 rounded-full" />
          <Block className="h-10 flex-1 rounded-full" />
          <Block className="size-10 shrink-0 rounded-full" />
        </div>
      </div>
      <span className="sr-only">Loading editor…</span>
    </div>
  )
}
