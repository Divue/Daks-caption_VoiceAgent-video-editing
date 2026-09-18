import { AudioLines, Clapperboard, FolderOpen, Home, LayoutTemplate, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  icon: typeof Home
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', icon: Home },
  { label: 'Projects', icon: FolderOpen },
  { label: 'Editor', icon: Clapperboard },
  { label: 'Templates', icon: LayoutTemplate },
]

/** Static nav rail — only "Editor" is a real destination; there's no router yet. */
export function AppSidebar() {
  return (
    <aside className="flex w-14 shrink-0 flex-col border-r border-hairline bg-sidebar text-sidebar-foreground lg:w-56">
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-signal-dim text-signal">
          <AudioLines className="size-4" strokeWidth={1.5} />
        </div>
        <span className="hidden truncate font-display text-[15px] font-semibold lg:inline">Expressive Captions</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const isActive = label === 'Editor'
          return (
            <button
              key={label}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              title={label}
              className={cn(
                'flex items-center gap-3 rounded-lg border-l-2 border-l-transparent px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'border-l-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="hidden truncate lg:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-hairline p-2">
        <button
          type="button"
          title="Settings"
          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="hidden truncate lg:inline">Settings</span>
        </button>
        <div className="flex items-center gap-3 px-2.5 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised font-mono text-[11px] text-muted-foreground">
            P3
          </div>
          <span className="hidden truncate text-sm text-muted-foreground lg:inline">Team member</span>
        </div>
      </div>
    </aside>
  )
}
