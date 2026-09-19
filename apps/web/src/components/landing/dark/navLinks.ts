export interface NavLink {
  label: string
  href: string
}

/** The four landing-page section anchors — single source of truth shared by
 * LandingNavbar.tsx and the dark/ footer, so the two link lists can't drift. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Voice Editing', href: '#voice-editing' },
  { label: 'For Creators', href: '#for-creators' },
]
