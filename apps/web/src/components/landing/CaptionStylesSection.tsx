import { AnimatedSection } from './AnimatedSection'

/** Illustrative marketing style categories — not the editor's real PRESETS data. */
const STYLES = [
  { name: 'Modern', fontFamily: 'Inter', weight: 600, color: '#F5F5F7', uppercase: false },
  { name: 'Bold', fontFamily: 'Poppins', weight: 800, color: '#FFFFFF', uppercase: true },
  { name: 'Karaoke', fontFamily: 'Poppins', weight: 700, color: '#FFE600', uppercase: false },
  { name: 'Cinematic', fontFamily: 'Instrument Serif', weight: 400, color: '#FFFFF0', uppercase: false },
]

export function CaptionStylesSection() {
  return (
    <section id="templates" className="border-t py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AnimatedSection>
          <p className="text-center text-sm font-semibold text-primary">Caption styles</p>
        </AnimatedSection>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STYLES.map((style, index) => (
            <AnimatedSection key={style.name} style={{ transitionDelay: `${index * 75}ms` }}>
              <div className="rounded-xl border p-3">
                <div
                  className="flex h-20 items-center justify-center overflow-hidden rounded-md bg-neutral-900 px-2 text-center"
                  style={{
                    fontFamily: style.fontFamily,
                    fontWeight: style.weight,
                    color: style.color,
                    textTransform: style.uppercase ? 'uppercase' : 'none',
                    fontSize: 18,
                  }}
                >
                  Hellooooo bhai
                </div>
                <p className="mt-2 text-center text-sm font-medium text-foreground">{style.name}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  )
}
