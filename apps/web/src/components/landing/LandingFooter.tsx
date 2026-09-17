import { Sparkles } from 'lucide-react'

const SOCIAL_LINKS = ['GitHub', 'LinkedIn']

const PRODUCT_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'AI Editing', href: '#ai-editing' },
  { label: 'Templates', href: '#templates' },
]
const COMPANY_LINKS = ['About', 'Contact']

export function LandingFooter() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </div>
            <span className="text-sm font-semibold text-foreground">Expressive Captions</span>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Product</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Company</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {COMPANY_LINKS.map((link) => (
                  <li key={link}>
                    <span className="text-xs text-muted-foreground">{link}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Social</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {SOCIAL_LINKS.map((label) => (
                  <li key={label}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Expressive Captions. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
