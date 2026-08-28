'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Minus } from 'lucide-react'
import { LuxorInquiryForm } from '@/components/LuxorInquiryForm'
import { Reveal } from '@/components/Reveal'
import { LUXOR_PACKAGE_PRESETS } from '@/lib/luxorServiceCatalog'

const packageFit: Record<string, string> = {
  rental_only: 'Best when you already have your own vendor team and want a polished venue foundation.',
  bronze_essentials: 'Best when you want the core celebration pieces coordinated together.',
  silver_premier: 'Best when you want a refined, planned event with decor, food, music, and a photo booth.',
  gold_all_inclusive: 'Best when you want Luxor to handle the broadest hosted experience with bar service included.',
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type PackageComparison = {
  id: string
  name: string
  price: number
  error: string | null
  items: { key: string; label: string; category: string }[]
}

type PackageComparisonResponse = {
  guestCount: number
  reference: { label: string }
  packages: PackageComparison[]
  features: { key: string; label: string; category: string }[]
}

function PackageComparisonTable({ comparison, error }: { comparison: PackageComparisonResponse | null; error: string | null }) {
  return (
    <section aria-labelledby="package-comparison-title" className="mt-16 border-t border-[#caa24c]/20 pt-10 sm:mt-20 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Included at a glance</p>
          <h3 id="package-comparison-title" className="mt-3 font-serif text-4xl leading-none sm:text-5xl">Compare what comes with each package.</h3>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[#d7c29a]/68">{comparison ? `Package pricing based on ${comparison.guestCount} guests · ${comparison.reference.label}.` : error || 'Loading the exact 100-guest package comparison…'}</p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-md border border-[#caa24c]/22 bg-[#0a0807]">
        <table className="min-w-[780px] w-full border-collapse text-left">
          <caption className="sr-only">Package comparison based on 100 guests</caption>
          <thead>
            <tr className="border-b border-[#caa24c]/20 bg-[#17100d]">
              <th scope="col" className="sticky left-0 z-10 min-w-[245px] bg-[#17100d] px-5 py-5 text-xs font-bold uppercase tracking-[.16em] text-[#d7c29a]/75">Included</th>
              {(comparison?.packages || [
                { id: 'rental_only', name: 'Rental Only', price: 0 },
                { id: 'bronze_essentials', name: 'Bronze Package', price: 0 },
                { id: 'silver_premier', name: 'Silver Package', price: 0 },
                { id: 'gold_all_inclusive', name: 'Gold Package', price: 0 },
              ]).map((plan) => (
                <th key={plan.id} scope="col" className={`min-w-[180px] px-5 py-5 align-top ${plan.id === 'gold_all_inclusive' ? 'bg-[#caa24c]/10' : ''}`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-[#caa24c]">{plan.name}</span>
                  <span className="mt-2 block font-mono text-xl text-[#f1d27a]">{plan.price ? money.format(plan.price) : '—'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(comparison?.features || []).map((feature) => (
              <tr key={feature.key} className="border-b border-[#caa24c]/12 last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-[#0a0807] px-5 py-4 text-sm font-medium text-[#eadcc8]/86">{feature.label}</th>
                {(comparison?.packages || []).map((plan) => {
                  const included = plan.items.some((item) => item.key === feature.key)
                  return <td key={plan.id} className={`px-5 py-4 text-center ${plan.id === 'gold_all_inclusive' ? 'bg-[#caa24c]/[.045]' : ''}`}>{included ? <Check aria-label="Included" className="mx-auto h-5 w-5 text-[#f1d27a]" /> : <Minus aria-label="Not included" className="mx-auto h-4 w-4 text-[#d7c29a]/28" />}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!comparison && !error ? <p className="px-5 py-8 text-sm text-[#d7c29a]/60">Loading the Builder’s current package inclusions…</p> : null}
      </div>
      <p className="mt-4 text-xs leading-5 text-[#d7c29a]/52">Reference prices are event-service totals only; the refundable security deposit is separate. Final proposals recalculate from the selected date, access window, guest count, and approved services.</p>
    </section>
  )
}

export default function PricingPageContent() {
  const [selectedPackage, setSelectedPackage] = useState('')
  const [comparison, setComparison] = useState<PackageComparisonResponse | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/public/package-comparison')
      .then(async (response) => {
        const payload = await response.json() as PackageComparisonResponse & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Package pricing is temporarily unavailable.')
        if (active) setComparison(payload)
      })
      .catch((error: unknown) => {
        if (active) setComparisonError(error instanceof Error ? error.message : 'Package pricing is temporarily unavailable.')
      })
    return () => { active = false }
  }, [])

  const packageById = useMemo(() => new Map(comparison?.packages.map((item) => [item.id, item]) || []), [comparison])

  function choosePackage(packageName: string) {
    setSelectedPackage(packageName)
    window.requestAnimationFrame(() => document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden bg-[#f7f3ec] pt-28">
        <div className="relative z-10 mx-auto grid min-h-[72svh] max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16 lg:px-8">
          <div className="min-w-0 text-center lg:text-left">
            <p className="font-mono text-xs font-bold uppercase tracking-[.28em] text-[#805b1f]">Packages & rates</p>
            <h1 className="mx-auto mt-5 max-w-xl font-serif text-5xl leading-[.9] text-[#241d17] sm:text-7xl lg:mx-0 lg:text-8xl">Real numbers before you fall in love with the room.</h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-[#665a4e] sm:text-lg lg:mx-0">See the venue rates, compare complete celebration packages, and request a final calculated proposal for your date. No tour is required just to learn whether Luxor fits your budget.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link href="#packages" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">Compare packages <ArrowRight className="h-4 w-4" /></Link>
              <Link href="#quote" data-conversion="inquiry_cta_click" data-conversion-label="Pricing hero" className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#9b6f24]/35 bg-white/70 px-6 py-3 text-sm font-semibold uppercase tracking-[.14em] text-[#241d17] transition hover:border-[#9b6f24]/60 hover:bg-white">Get my final proposal</Link>
            </div>
          </div>
          <div className="relative min-h-[30rem] overflow-hidden rounded-md border border-[#9b6f24]/25 bg-[#eee6da] shadow-[0_32px_80px_-48px_rgba(61,43,23,0.42)] sm:min-h-[38rem] lg:min-h-[calc(100vh-11rem)]">
            <Image src="/images/dining-hall/main-hall-wedding-wide.png" alt="Luxor main hall prepared for dinner and dancing" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover object-center" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/25 to-transparent" />
          </div>
        </div>
      </section>

      <section id="packages" className="bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl"><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Four celebration packages</p><h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">Choose how much you want Luxor to handle.</h2><p className="mt-5 text-base leading-7 text-[#d7c29a]/72">Choose the closest fit now. Your final proposal calculates each included component from your selected date, rental window, guest count, and approved services.</p></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LUXOR_PACKAGE_PRESETS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 70}>
                <article className={`flex h-full flex-col rounded-md border p-6 ${plan.id === 'gold_all_inclusive' ? 'border-[#f1d27a]/65 bg-[#17100d] shadow-[0_28px_80px_-52px_rgba(202,162,76,.7)]' : 'border-[#caa24c]/22 bg-[#0a0807]'}`}>
                  <p className="font-mono text-xs uppercase tracking-[.24em] text-[#caa24c]">{plan.eyebrow}</p>
                  <h3 className="mt-5 font-serif text-4xl">{plan.name}</h3>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[.16em] text-[#caa24c]">100-guest reference price</p>
                  {packageById.get(plan.id)?.price !== undefined ? <p className="mt-1 font-mono text-2xl font-bold text-[#f1d27a]">{money.format(packageById.get(plan.id)!.price)}</p> : <p className="mt-1 text-sm text-[#d7c29a]/56">{comparisonError || 'Loading exact price…'}</p>}
                  <p className="mt-5 text-sm leading-6 text-[#d7c29a]/72">{plan.description}</p>
                  <p className="mt-4 border-l border-[#caa24c]/35 pl-4 text-xs leading-5 text-[#eadcc8]/68">{packageFit[plan.id]}</p>
                  <div className="mt-6 flex-1" />
                  <button type="button" onClick={() => choosePackage(plan.name)} data-conversion="package_cta_click" data-conversion-label={plan.name} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-4 py-3 text-xs font-bold uppercase tracking-[.14em] text-[#050505] transition hover:bg-[#dfbd68] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1d27a]">Choose {plan.name} <ArrowRight className="h-4 w-4" /></button>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <PackageComparisonTable comparison={comparison} error={comparisonError} />
          </Reveal>
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
