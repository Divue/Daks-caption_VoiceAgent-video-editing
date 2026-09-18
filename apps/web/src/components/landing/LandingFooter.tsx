import { LANDING_LINKS } from './landing-links'

/** Wordmark, section links and the year. No placeholder links that go nowhere. */
export function LandingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-300 flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <a href="#top" className="font-display text-base font-semibold text-foreground">
          Expressive Captions
        </a>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LANDING_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="font-mono text-[13px] text-faint">© {new Date().getFullYear()} Expressive Captions</p>
      </div>
    </footer>
  )
}
