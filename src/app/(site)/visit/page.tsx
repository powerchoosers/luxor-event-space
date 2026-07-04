import Link from 'next/link'
import { ArrowRight, Check, Clock, MapPin } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { LuxorInquiryForm } from '@/components/LuxorInquiryForm'

const tourReasons = [
  'Confirm your guest flow',
  'Talk through packages and add-ons',
  'Check date availability',
  'Picture decor, photos, dinner, and dancing',
]

const tourSteps = [
  ['Before', 'Share your event type, rough guest count, date range, and the package level you are considering.'],
  ['During', 'Walk the room around entrance, seating, photos, music, dinner, decor, and the main celebration moment.'],
  ['After', 'Leave with a clearer package direction and a list of details to confirm before reserving your date.'],
]

const questions = [
  ['Should I tour before I know my exact guest count?', 'Yes. A rough range is enough to start seeing which layouts make sense.'],
  ['Can I compare packages during the visit?', 'Yes. The tour should help connect the package tiers to the event you are actually planning.'],
  ['What should I bring?', 'Bring inspiration photos, target dates, guest count, and any must-have moments like entrance, cake, DJ, or photo booth.'],
]

export default function VisitPage() {
  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem),linear-gradient(180deg,#120d0c,#050505)] px-5 pb-16 pt-36 sm:px-6 lg:px-8 lg:pb-24 lg:pt-44">
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="mx-auto max-w-2xl text-center">
            <LuxorAxisLockup className="mx-auto mb-8 w-full max-w-[360px] sm:max-w-[460px]" />
            <h1 className="font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              Come see if the room feels right.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">
              A private tour is the best way to understand the size, lighting, guest flow, and package options for your celebration.
            </p>
            <div className="mx-auto mt-8 grid max-w-xl gap-3 text-left">
              {tourReasons.map((reason) => (
                <div key={reason} className="flex items-center gap-3 border-t border-[#caa24c]/16 pt-4 text-[#d7c29a]/78">
                  <Check className="h-4 w-4 shrink-0 text-[#caa24c]" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
            <div className="mx-auto mt-8 grid max-w-xl gap-3 text-left text-sm leading-6 text-[#d7c29a]/70">
              <p className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-[#caa24c]" />
                <span>803 Castroville Rd #402, San Antonio, TX 78237</span>
              </p>
              <p className="flex items-center gap-3"><Clock className="h-4 w-4 text-[#caa24c]" /> Private tours by appointment</p>
            </div>
          </div>

          <div>
            <LuxorInquiryForm source="visit_page" showTourFields />
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Tour process</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Know what happens before, during, and after the tour.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {tourSteps.map(([title, copy], index) => (
              <Reveal key={title} delay={index * 70}>
                <article className="h-full rounded-md border border-[#caa24c]/20 bg-white/[0.025] p-6">
                  <div className="flex items-center gap-4">
                    <span className="font-serif text-3xl text-[#caa24c]">{String(index + 1).padStart(2, '0')}</span>
                    <div className="h-px flex-1 bg-[#caa24c]/22" />
                  </div>
                  <h3 className="mt-6 font-serif text-3xl text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#050505] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <Reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Before you book</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Questions worth asking on the walkthrough.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="divide-y divide-[#caa24c]/18 border-y border-[#caa24c]/18">
              {questions.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-serif text-xl leading-7 text-[#f7efe3] marker:hidden">
                    {question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#caa24c] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-2xl pt-4 text-sm leading-7 text-[#d7c29a]/68 sm:text-base">{answer}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
