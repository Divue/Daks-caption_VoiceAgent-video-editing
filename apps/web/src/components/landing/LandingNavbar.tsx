import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScrollFrame } from '@/hooks/useScrollFrame'
import { cn } from '@/lib/utils'
import { useRoute } from '@/router'
import { LANDING_LINKS } from './landing-links'

/** Which section is under the middle band of the viewport, or null (e.g. in the hero). */
function useActiveSection(hrefs: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const sections = hrefs
      .map((href) => document.querySelector<HTMLElement>(href))
      .filter((section): section is HTMLElement => section !== null)
    const visible = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const href = `#${entry.target.id}`
          if (entry.isIntersecting) visible.add(href)
          else visible.delete(href)
        }
        // First link (page order) whose section crosses the band wins.
        setActive(hrefs.find((href) => visible.has(href)) ?? null)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [hrefs])

  return active
}

const HREFS = LANDING_LINKS.map((link) => link.href)

/**
 * Floating, inset pill nav (design.md §5 and the hero reference): wordmark, links, one CTA.
 * Once the page scrolls it tightens and gains the soft floating shadow, and a pill slides
 * under the link of the section being read (scroll-spy).
 */
export function LandingNavbar() {
  const { navigate } = useRoute()
  const [scrolled, setScrolled] = useState(false)
  const active = useActiveSection(HREFS)
  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // Only commits when the boolean flips, so scrolling doesn't re-render the nav every frame.
  useScrollFrame(() => {
    const next = window.scrollY > 24
    setScrolled((current) => (current === next ? current : next))
  })

  useLayoutEffect(() => {
    function measure() {
      const link = active ? navRef.current?.querySelector<HTMLElement>(`a[href="${active}"]`) : null
      setPill(link ? { left: link.offsetLeft, width: link.offsetWidth } : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active])

  return (
    <header className="fixed inset-x-0 top-3 z-30 px-3 sm:top-4 sm:px-4">
      <div
        className={cn(
          'mx-auto flex max-w-300 items-center justify-between rounded-[20px] border border-hairline pr-2.5 pl-5 transition-[height,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:pl-6',
          scrolled ? 'h-14 bg-surface/[0.97] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]' : 'h-16 bg-surface/90 backdrop-blur-xl',
        )}
      >
        <a href="#top" className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
          Expressive Captions
        </a>

        <nav ref={navRef} aria-label="Sections" className="relative hidden items-center gap-1 md:flex">
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 rounded-full bg-overlay transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              pill ? 'opacity-100' : 'opacity-0',
            )}
            style={{ left: pill?.left ?? 0, width: pill?.width ?? 0 }}
          />
          {LANDING_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={active === link.href ? 'true' : undefined}
              className={cn(
                'relative rounded-full px-3.5 py-1.5 text-[15px] transition-colors duration-150',
                active === link.href ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button
          type="button"
          className={cn(
            'group/cta gap-1.5 rounded-full px-5 text-[15px] transition-[height] duration-300',
            scrolled ? 'h-10' : 'h-11',
          )}
          onClick={() => navigate('/editor')}
        >
          Open editor
          <ArrowUpRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
        </Button>
      </div>
    </header>
  )
}
