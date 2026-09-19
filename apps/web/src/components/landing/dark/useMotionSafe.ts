import { useState } from 'react'

/** Same reduced-motion check LandingPage.tsx, VoiceSphere.tsx and
 * LandingNavbar.tsx each already run independently — computed once per
 * mount and shared here so the six dark/ sections don't repeat it. */
export function useMotionSafe(): boolean {
  const [motionSafe] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return motionSafe
}
