import { AiEditingSection } from '@/components/landing/AiEditingSection'
import { CaptionStylesSection } from '@/components/landing/CaptionStylesSection'
import { FinalCtaSection } from '@/components/landing/FinalCtaSection'
import { HeroSection } from '@/components/landing/HeroSection'
import { IntroSection } from '@/components/landing/IntroSection'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import { PipelineSection } from '@/components/landing/PipelineSection'
import { ScrollProgress } from '@/components/landing/ScrollProgress'

/** Stateless marketing page — no ProjectProvider, no editor state. Theme comes from <html>. */
export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <ScrollProgress />
      <LandingNavbar />
      <main>
        <HeroSection />
        <IntroSection />
        <PipelineSection />
        <AiEditingSection />
        <CaptionStylesSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
