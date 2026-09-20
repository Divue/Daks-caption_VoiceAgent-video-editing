import { BrandMark } from '../LandingNavbar'
import { NAV_LINKS } from './navLinks'
import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

/**
 * Minimal footer — didn't exist before. Brand mark/name, the four section
 * links (same list LandingNavbar uses, from ./navLinks), and one copyright
 * line. Deliberately nothing else: no newsletter signup, no social icons
 * (no accounts to point to), no legal pages (none exist yet).
 */
export function LandingFooter() {
  const motionSafe = useMotionSafe()

  return (
    <footer className="border-t border-line-subtle py-10">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        {/* Two columns, each its own reveal — the outer row itself doesn't also animate, or the
            columns would arrive twice. */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <RevealItem motionSafe={motionSafe} className="flex items-center gap-2 text-ink-primary">
            <BrandMark />
            <span className="font-display text-heading-md">Expressive Captions</span>
          </RevealItem>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {NAV_LINKS.map((link, index) => (
              <RevealItem key={link.href} motionSafe={motionSafe} style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}>
                <a href={link.href} className="text-body-sm text-ink-tertiary transition-colors duration-200 hover:text-ink-primary">
                  {link.label}
                </a>
              </RevealItem>
            ))}
          </nav>
        </div>
        <RevealItem motionSafe={motionSafe} className="mt-8" style={{ animationDelay: `${Math.min(NAV_LINKS.length, 5) * 70}ms` }}>
          <p className="text-center font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">
            © {new Date().getFullYear()} Expressive Captions
          </p>
        </RevealItem>
      </div>
    </footer>
  )
}
