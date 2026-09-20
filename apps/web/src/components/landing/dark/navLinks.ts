export interface NavLink {
  label: string
  href: string
}

/** The dark/ footer's four section anchors. Every href here is a section id that exists on the
 * landing page; LandingNavbar carries its own list because its items also group into dropdowns. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Tone aware captions', href: '#showcase' },
  { label: 'Made for Hinglish', href: '#made-for-hinglish' },
  { label: 'Hear the difference', href: '#hear-the-difference' },
  { label: 'How it works', href: '#how-it-works' },
]
