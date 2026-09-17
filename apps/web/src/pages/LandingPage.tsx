import { AiEditingSection } from '@/components/landing/AiEditingSection'
import { CaptionStylesSection } from '@/components/landing/CaptionStylesSection'
import { CreatorSection } from '@/components/landing/CreatorSection'
import { FinalCtaSection } from '@/components/landing/FinalCtaSection'
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import { ValuePropsSection } from '@/components/landing/ValuePropsSection'

/** Stateless marketing page — no ProjectProvider, no editor state. */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />
      <HeroSection />
      <ValuePropsSection />
      <HowItWorksSection />
      <AiEditingSection />
      <CaptionStylesSection />
      <CreatorSection />
      <FinalCtaSection />
      <LandingFooter />
    </div>
  )
}
