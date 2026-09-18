import { Clapperboard, FolderOpen, Home, LayoutTemplate, Settings, Sparkles } from 'lucide-react'
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

/**
 * Static nav rail — only "Editor" is a real destination; there's no router yet.
 *
 * Icons only, at 56px. It was 176px of permanent width for three inert destinations plus the page
 * you are already on (audit 16 §2.13); in a tool whose whole job happens in one screen, that
 * width belongs to the video.
 */
export function AppSidebar() {
  return (
    <aside className="flex w-14 shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center justify-center">
        {/* The mark is the one place the brand spectrum appears in the editor chrome. */}
        <div
          className="sunset-stripe flex size-7 shrink-0 items-center justify-center rounded-md"
          title="Expressive Captions"
        >
          <Sparkles className="size-3.5 text-[oklch(0.2_0.02_45)]" />
        </div>
      </div>


      <nav className="flex flex-1 flex-col items-center gap-1 p-2 pt-2">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const isActive = label === 'Editor'
          return (
            <button
              key={label}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              title={label}
              className={cn(
                'relative flex size-9 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-primary" />
              )}
              <Icon className="size-4 shrink-0" />
              <span className="sr-only">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-2 border-t border-border/60 p-2">
        <button
          type="button"
          title="Settings"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <Settings className="size-4 shrink-0" />
          <span className="sr-only">Settings</span>
        </button>
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
          title="Team member"
        >
          P3
        </div>
      </div>
    </aside>
  )
}
