import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'AI Editing', href: '#ai-editing' },
  { label: 'Templates', href: '#templates' },
]

export function LandingNavbar() {
  const { navigate } = useRoute()

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">Expressive Captions</span>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button type="button" size="sm" onClick={() => navigate('/editor')}>
          Get started
        </Button>
      </div>
    </header>
  )
}
