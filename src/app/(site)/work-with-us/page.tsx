import type { Metadata } from 'next'
import Image from 'next/image'
import { WORK_WITH_US_OPPORTUNITIES } from '@/lib/luxorWorkWithUsContent'
import { WorkWithUsOpportunityCard } from '@/components/WorkWithUsOpportunityCard'

export const metadata: Metadata = {
  title: 'Work With Us | Luxor at Las Palmas Events',
  description:
    'Partner with Luxor at Las Palmas Events. Explore vendor, workshop, sponsorship, and collaboration opportunities.',
}

const HERO_SCRIM =
  'linear-gradient(105deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.52) 42%, rgba(0,0,0,0.18) 100%)'

export default function WorkWithUsPage() {
  return (
    <main className="bg-[#faf7f1] text-[#241d17]">
      <section className="relative isolate min-h-[72svh] overflow-hidden sm:min-h-[80svh]">
        <Image
          src="/images/dining-hall/main-hall-wedding-wide.png"
          alt="Luxor ballroom prepared for an event"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: HERO_SCRIM }} />
        <div className="relative z-10 mx-auto flex min-h-[72svh] max-w-4xl flex-col items-center justify-center px-5 py-32 text-center sm:min-h-[80svh] sm:px-6">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] sm:text-[11px] sm:tracking-[0.28em]"
            style={{ color: '#f1d27a', textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}
          >
            Luxor at Las Palmas
          </p>
          <h1
            className="mt-4 font-serif text-5xl uppercase leading-[0.95] sm:text-6xl"
            style={{ color: '#fffaf3', textShadow: '0 2px 12px rgba(0,0,0,0.25)' }}
          >
            Work With Us
          </h1>
          <div className="mt-5 luxor-deco-divider max-w-xs text-[#caa24c]">
            <span className="luxor-diamond" />
          </div>
          <p className="mt-6 max-w-2xl text-base leading-7 sm:text-lg" style={{ color: '#eadcc8' }}>
            Partner with Luxor! Explore opportunities to get involved with our events, submit your business, or
            collaborate with our team.
          </p>
        </div>
      </section>

      <section className="relative py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {WORK_WITH_US_OPPORTUNITIES.map((opportunity) => (
              <WorkWithUsOpportunityCard key={opportunity.key} opportunity={opportunity} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#1a2421] py-16 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 bottom-0 h-40 w-56 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at bottom left, rgba(92, 120, 90, 0.8), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 h-40 w-56 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at bottom right, rgba(92, 120, 90, 0.8), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-6">
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-16 bg-[#caa24c]/50" aria-hidden />
            <h2
              className="font-serif text-3xl uppercase tracking-[0.12em] sm:text-4xl"
              style={{ color: '#fffaf3' }}
            >
              Let&apos;s Collaborate
            </h2>
            <span className="h-px w-16 bg-[#caa24c]/50" aria-hidden />
          </div>
          <p className="mt-6 text-base leading-7 sm:text-lg" style={{ color: '#d7c9b5' }}>
            From local markets to workshops and special events, there are many ways to partner with Luxor at Las Palmas
            Events. We look forward to working with you!
          </p>
        </div>
      </section>
    </main>
  )
}