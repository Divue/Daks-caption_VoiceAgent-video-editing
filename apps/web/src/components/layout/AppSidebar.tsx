import { Clapperboard, FolderOpen, Home, LayoutTemplate, Settings, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRoute } from '@/router'

interface NavItem {
  label: string
  icon: typeof Home
  /** Where it goes. Items with no destination are still inert and say so on hover. */
  go?: () => void
}

/**
 * Static nav rail — only "Editor" is a real destination; there's no router yet.
 *
 * Icons only, at 56px. It was 176px of permanent width for three inert destinations plus the page
 * you are already on (audit 16 §2.13); in a tool whose whole job happens in one screen, that
 * width belongs to the video.
 */
export function AppSidebar() {
  const { navigate } = useRoute()

  // Home and Projects were inert; both have a real destination, so they get one. Templates does
  // not exist yet and stays inert rather than being wired to something that is not it.
  const items: NavItem[] = [
    { label: 'Home', icon: Home, go: () => navigate('/') },
    { label: 'Projects', icon: FolderOpen, go: () => navigate('/editor') },
    { label: 'Editor', icon: Clapperboard },
    { label: 'Templates', icon: LayoutTemplate },
  ]

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
        {items.map(({ label, icon: Icon, go }) => {
          const isActive = label === 'Editor'
          return (
            <button
              key={label}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={go}
              title={go || isActive ? label : `${label} — not built yet`}
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
