'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { LuxorInquiryForm } from '@/components/LuxorInquiryForm'
import { Reveal } from '@/components/Reveal'
import { LUXOR_PACKAGE_PRESETS, getLuxorCatalogItem } from '@/lib/luxorServiceCatalog'

const rentalRows = [
  { day: 'Monday–Thursday', ids: ['rental-weekday-morning', 'rental-weekday-evening', 'rental-weekday-full'] },
  { day: 'Friday', ids: ['rental-friday-morning', 'rental-friday-evening', 'rental-friday-full'] },
  { day: 'Saturday', ids: ['rental-saturday-morning', 'rental-saturday-evening', 'rental-saturday-full'] },
  { day: 'Sunday', ids: ['rental-sunday-morning', 'rental-sunday-evening', 'rental-sunday-full'] },
]

const packageHighlights: Record<string, string[]> = {
  rental_only: ['Venue rental for your selected window', 'Required cleaning and security', 'Tables and chairs setup'],
  bronze_essentials: ['Essential Decor', 'Buffet catering', 'Six-hour DJ'],
  silver_premier: ['Full Decor & Planning', 'Buffet catering and six-hour DJ', 'Signature Photo Booth'],
  gold_all_inclusive: ['Full Decor & Planning', 'Buffet, DJ, and Signature Photo Booth', 'Bartender service up to five hours'],
}

const packageFit: Record<string, string> = {
  rental_only: 'Best when you already have your own vendor team and want a polished venue foundation.',
  bronze_essentials: 'Best when you want the core celebration pieces coordinated together.',
  silver_premier: 'Best when you want a refined, planned event with decor, food, music, and a photo booth.',
  gold_all_inclusive: 'Best when you want Luxor to handle the broadest hosted experience with bar service included.',
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function PricingPageContent() {
  const [selectedPackage, setSelectedPackage] = useState('')

  function choosePackage(packageName: string) {
    setSelectedPackage(packageName)
    window.requestAnimationFrame(() => document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden pt-28">
        <Image src="/images/dining-hall/main-hall-wedding-wide.png" alt="Luxor main hall prepared for dinner and dancing" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.96),rgba(5,5,5,.7)_55%,rgba(5,5,5,.3)),linear-gradient(180deg,rgba(5,5,5,.45),#050505_96%)]" />
        <div className="absolute inset-0 luxor-noise opacity-20" />
        <div className="relative z-10 mx-auto flex min-h-[72svh] max-w-7xl items-center px-5 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[.28em] text-[#f1d27a]">Packages & rates</p>
            <h1 className="mt-5 font-serif text-5xl leading-[.9] sm:text-7xl lg:text-8xl">Real numbers before you fall in love with the room.</h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-[#eadcc8]/82 sm:text-lg">See the venue rates, compare complete celebration packages, and request a final calculated proposal for your date. No tour is required just to learn whether Luxor fits your budget.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="#packages" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">Compare packages <ArrowRight className="h-4 w-4" /></Link>
              <Link href="#quote" data-conversion="inquiry_cta_click" data-conversion-label="Pricing hero" className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#caa24c]/40 bg-black/35 px-6 py-3 text-sm font-semibold uppercase tracking-[.14em]">Get my final proposal</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl"><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Venue rental · from $1,000</p><h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">Start with the room. Add only what your celebration needs.</h2><p className="mt-5 text-base leading-7 text-[#d7c29a]/72">Morning is 9am–4pm, evening is 6pm–1am, and full day is 11am–11pm. These are the actual base rental rates; availability and required services are confirmed in your final proposal.</p></Reveal>
          <Reveal delay={100}>
            <div className="mt-10 overflow-hidden rounded-md border border-[#caa24c]/22">
              <div className="hidden grid-cols-4 bg-[#120d0c] px-6 py-4 font-mono text-xs uppercase tracking-[.2em] text-[#caa24c] sm:grid"><span>Day</span><span>Morning</span><span>Evening</span><span>Full day</span></div>
              {rentalRows.map((row) => <div key={row.day} className="grid gap-4 border-t border-[#caa24c]/16 bg-[#0a0807] px-6 py-5 first:border-t-0 sm:grid-cols-4 sm:items-center"><strong className="font-serif text-2xl font-normal">{row.day}</strong>{row.ids.map((id, index) => { const rate = getLuxorCatalogItem(id)?.unitPrice || 0; return <div key={id}><span className="mr-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#caa24c] sm:hidden">{['Morning','Evening','Full day'][index]}</span><span className="text-lg text-[#eadcc8]">{money.format(rate)}</span></div> })}</div>)}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="packages" className="bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl"><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Four celebration packages</p><h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">Choose how much you want Luxor to handle.</h2><p className="mt-5 text-base leading-7 text-[#d7c29a]/72">Choose the closest fit now. Your final proposal calculates each included component from your selected date, rental window, guest count, and approved services.</p></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LUXOR_PACKAGE_PRESETS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 70}>
                <article className={`flex h-full flex-col rounded-md border p-6 ${plan.id === 'silver_premier' ? 'border-[#f1d27a]/55 bg-[#17100d] shadow-[0_28px_80px_-52px_rgba(202,162,76,.7)]' : 'border-[#caa24c]/22 bg-[#0a0807]'}`}>
                  <p className="font-mono text-xs uppercase tracking-[.24em] text-[#caa24c]">{plan.eyebrow}</p>
                  <h3 className="mt-5 font-serif text-4xl">{plan.name}</h3>
                  <p className="mt-4 text-sm font-semibold text-[#f1d27a]">Final price calculated for your event</p>
                  <p className="mt-1 text-xs text-[#d7c29a]/56">No fixed package totals</p>
                  <p className="mt-5 text-sm leading-6 text-[#d7c29a]/72">{plan.description}</p>
                  <p className="mt-4 border-l border-[#caa24c]/35 pl-4 text-xs leading-5 text-[#eadcc8]/68">{packageFit[plan.id]}</p>
                  <ul className="mt-6 flex-1 space-y-3">{packageHighlights[plan.id].map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#eadcc8]/82"><Check className="mt-1 h-4 w-4 shrink-0 text-[#caa24c]" />{item}</li>)}</ul>
                  <button type="button" onClick={() => choosePackage(plan.name)} data-conversion="package_cta_click" data-conversion-label={plan.name} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-4 py-3 text-xs font-bold uppercase tracking-[.14em] text-[#050505] transition hover:bg-[#dfbd68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1d27a]">Choose {plan.name} <ArrowRight className="h-4 w-4" /></button>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="quote" className="scroll-mt-24 bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:px-8">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Personalized pricing</p>
            <h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">Get the number that matters: yours.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#d7c29a]/72">Share the basics and a Luxor coordinator will confirm availability, package fit, and a final calculated proposal. Selecting a package is helpful, not a commitment.</p>
            <div className="mt-8 space-y-3 text-sm text-[#eadcc8]/78">
              {['Your package choice is saved with the lead.', 'Your date and guest count shape the final number.', 'You can request a tour after reviewing the fit.'].map((item) => <p key={item} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#caa24c]" />{item}</p>)}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <LuxorInquiryForm source="pricing_page" flow="pricing_quote" title="Request your proposal." submitLabel="Request my proposal" initialPackageInterest={selectedPackage} />
          </Reveal>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
          <Reveal><h2 className="font-serif text-4xl leading-none sm:text-6xl">What shapes the final price?</h2></Reveal>
          <Reveal delay={100}><div className="grid gap-4 sm:grid-cols-2">{[
            ['Date and rental window', 'Weekday, Friday, Saturday, and Sunday rates differ, as do morning, evening, and full-day windows.'],
            ['Guest count', 'Cleaning, security, catering, and bar needs can change as the guest count grows.'],
            ['Food, decor, and entertainment', 'Choose venue essentials or add decor, catering, DJ, photo booth, and bar service.'],
            ['Your exact event', 'The team confirms availability and the final service mix before anything is booked.'],
          ].map(([title, copy]) => <article key={title} className="border-t border-[#caa24c]/26 py-5"><h3 className="font-serif text-2xl">{title}</h3><p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p></article>)}</div></Reveal>
        </div>
      </section>

      <section className="bg-[#050505] px-5 py-16 sm:px-6 sm:py-24 lg:px-8"><Reveal><div className="luxor-panel mx-auto flex max-w-7xl flex-col gap-7 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">The room changes the decision</p><h2 className="mt-3 max-w-3xl font-serif text-4xl leading-none sm:text-5xl">Know the price. Then experience Luxor in person.</h2></div><Link href="/tour#tour-availability" data-conversion="tour_cta_click" data-conversion-label="Pricing footer" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">Check tour times <ArrowRight className="h-4 w-4" /></Link></div></Reveal></section>
    </main>
  )
}
