'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { Reveal } from '@/components/Reveal'
import { LuxorWordmark } from '@/components/LuxorWordmark'

type PlanVariant = 'light' | 'dark' | 'rose'

type PricingPlan = {
  name: string
  badge: string
  summary: string
  bestFor: string
  includes: string[]
  variant: PlanVariant
  featured?: boolean
  actionLabel: string
}



const pricingPlans: PricingPlan[] = [
  {
    name: 'Foundation',
    badge: 'Entry package',
    summary: 'A clean base package for hosts who want the room essentials handled without extras.',
    bestFor: 'Best for straightforward events that need the room set, dressed, and ready.',
    includes: [
      'Tables',
      'Chairs',
      'Basic tablecloths',
      'Access to the lounge room',
      'VIP access',
    ],
    variant: 'light',
    actionLabel: 'Request Foundation quote',
  },
  {
    name: 'Signature',
    badge: 'Most chosen',
    summary: 'Everything in Foundation plus a light decor package that makes the room feel finished.',
    bestFor: 'Best for guests who want the next level of polish without going all in.',
    includes: ['Everything in Foundation', 'Light decor package'],
    variant: 'dark',
    featured: true,
    actionLabel: 'Request Signature quote',
  },
  {
    name: 'Showpiece',
    badge: 'All inclusive',
    summary: 'The full production tier with decor, sound, and a photo moment built in.',
    bestFor: 'Best for a one-stop celebration that needs the room to feel complete on arrival.',
    includes: [
      'Everything in Foundation',
      'Everything in Signature',
      'Full decor package',
      'DJ',
      'Photo booth',
    ],
    variant: 'rose',
    actionLabel: 'Request Showpiece quote',
  },
]

function SectionTitle({
  eyebrow,
  title,
  copy,
  align = 'left',
  dark = false,
}: {
  eyebrow: string
  title: string
  copy: string
  align?: 'left' | 'center'
  dark?: boolean
}) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p className={`font-mono text-[10px] uppercase tracking-[0.42em] ${dark ? 'text-[#f1d27a]' : 'text-[#caa24c]'}`}>{eyebrow}</p>
      <h2 className={`mt-4 font-serif text-4xl leading-[0.95] ${dark ? 'text-[#f8f3ed]' : 'text-[#f7efe3]'} sm:text-5xl lg:text-6xl`}>
        {title}
      </h2>
      <p className={`mt-5 max-w-2xl text-base leading-7 ${dark ? 'text-white/75' : 'text-[#d7c29a]/72'} sm:text-lg`}>{copy}</p>
    </div>
  )
}

function PricingHeroVisual() {
  return (
    <div className="relative">
      <motion.div
        animate={{ 
          x: [-12, 12, -12],
          y: [-12, 12, -12],
        }}
        transition={{ 
          duration: 9, 
          repeat: Infinity,
          ease: "linear" 
        }}
        className="absolute -left-6 top-12 h-40 w-40 bg-[#caa24c]/18 blur-3xl luxor-ambient" 
      />
      <motion.div
        animate={{ 
          x: [12, -12, 12],
          y: [12, -12, 12],
        }}
        transition={{ 
          duration: 11, 
          repeat: Infinity,
          ease: "linear" 
        }}
        className="absolute -right-6 bottom-12 h-44 w-44 bg-[#bd6575]/18 blur-3xl luxor-ambient" 
      />

      <motion.figure 
        layoutId="hero-image"
        className="luxor-deco-frame relative isolate min-h-[620px] overflow-hidden border border-[#caa24c]/25 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)]"
      >
        <img
          src="/pricing-hero.png"
          alt="Luxor venue styling sample"
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.58))]" />
        <div className="absolute inset-0 opacity-60 luxor-noise" />


      </motion.figure>
    </div>
  )
}

function TierCard({ plan, index }: { plan: PricingPlan; index: number }) {
  const styles: Record<
    PlanVariant,
    {
      card: string
      eyebrow: string
      copy: string
      check: string
      button: string
      buttonText: string
      badge: string
    }
  > = {
    light: {
      card: 'bg-[#0a0807] border-[#caa24c]/24 text-[#f8f3ed] shadow-[0_24px_60px_-48px_rgba(0,0,0,0.85)]',
      eyebrow: 'text-[#caa24c]',
      copy: 'text-[#d7c29a]/70',
      check: 'text-[#caa24c]',
      button: 'bg-[#caa24c] text-[#050505] hover:bg-[#f1d27a]',
      buttonText: 'Request quote',
      badge: 'border-[#caa24c]/24 bg-[#caa24c]/8 text-[#f1d27a]',
    },
    dark: {
      card: 'bg-[#050505] border-[#f1d27a]/38 text-[#f8f3ed] shadow-[0_28px_80px_-48px_rgba(202,162,76,0.4)]',
      eyebrow: 'text-[#f1d27a]',
      copy: 'text-white/72',
      check: 'text-[#f1d27a]',
      button: 'bg-[#caa24c] text-[#050505] hover:bg-[#f1d27a]',
      buttonText: 'Request quote',
      badge: 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#f1d27a]',
    },
    rose: {
      card:
        'bg-[radial-gradient(circle_at_top_right,rgba(189,101,117,0.3),transparent_22%),linear-gradient(145deg,#2a1219_0%,#0a0707_58%,#3a2027_100%)] border-[#caa24c]/24 text-white shadow-[0_24px_60px_-48px_rgba(0,0,0,0.85)]',
      eyebrow: 'text-[#f2d8d6]',
      copy: 'text-white/76',
      check: 'text-[#f2d8d6]',
      button: 'bg-white text-[#100b0d] hover:bg-[#f4ebe2]',
      buttonText: 'Request quote',
      badge: 'border-[#caa24c]/24 bg-white/10 text-white/70',
    },
  }

  const variant = styles[plan.variant]
  const featuredLift = plan.featured ? 'lg:-mt-6 lg:scale-[1.02]' : ''

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -12, transition: { duration: 0.3 } }}
      className={`relative flex h-full flex-col overflow-hidden border p-6 sm:p-7 ${variant.card} ${featuredLift}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`font-mono text-[10px] uppercase tracking-[0.34em] ${variant.eyebrow}`}>
          Tier 0{index + 1}
        </p>
        <span
          className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.32em] ${variant.badge}`}
        >
          {plan.badge}
        </span>
      </div>

      <h3 className="mt-6 font-serif text-3xl leading-[0.95] sm:text-4xl">{plan.name}</h3>
      <p className={`mt-4 text-base leading-7 ${variant.copy}`}>{plan.summary}</p>

      <div className="mt-6 border border-[#caa24c]/16 bg-white/[0.03] p-4">
        <p className={`font-mono text-[10px] uppercase tracking-[0.34em] ${variant.eyebrow}`}>
          Best for
        </p>
        <p className={`mt-2 text-sm leading-6 ${variant.copy}`}>{plan.bestFor}</p>
      </div>

      <div className="mt-6 flex-1">
        <p className={`font-mono text-[10px] uppercase tracking-[0.34em] ${variant.eyebrow}`}>
          Includes
        </p>
        <ul className="mt-4 space-y-3">
          {plan.includes.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-6 sm:text-[15px]">
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${variant.check}`} />
              <span className={variant.copy}>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <motion.a
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        href="/#visit"
        className={`mt-8 inline-flex items-center justify-center gap-2 border border-[#f1d27a]/30 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] transition-transform duration-200 ${variant.button}`}
      >
        {plan.actionLabel}
        <ArrowRight className="h-4 w-4" />
      </motion.a>
    </motion.article>
  )
}

export default function PricingPageContent() {
  return (
    <main id="top" className="overflow-x-hidden bg-[#050505]">
      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(202,162,76,0.18),transparent_28rem),radial-gradient(circle_at_18%_18%,rgba(189,101,117,0.12),transparent_22rem),linear-gradient(135deg,#050505_0%,#120d0c_48%,#050505_100%)] text-[#f8f3ed]">
        <div className="absolute inset-0 luxor-noise opacity-35" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,5,6,0.2),rgba(7,5,6,0.74))]" />


        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-32 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8 lg:pb-20 lg:pt-40">
          <Reveal delay={60} className="max-w-2xl">
            <LuxorWordmark className="mb-7 max-w-[560px]" />
            <div className="luxor-deco-divider mb-8 max-w-md"><span className="luxor-diamond" /></div>
            <h1 className="mt-5 max-w-xl font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-7xl">
              Three packages with the same black-and-gold polish.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/80 sm:text-lg">
              Foundation keeps it clean. Signature adds light decor. Showpiece brings the full room together
              with decor, a DJ, and a photo booth.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#tiers"
                className="inline-flex items-center gap-2 border border-[#f1d27a]/40 bg-[#caa24c] px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#050505] shadow-[0_20px_40px_-24px_rgba(202,162,76,0.65)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                Compare packages
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#visit"
                className="inline-flex items-center gap-2 border border-[#caa24c]/28 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors duration-200 hover:border-[#f1d27a]/50 hover:bg-[#caa24c]/10"
              >
                Ask for a quote
              </Link>
            </div>

            <p className="mt-6 max-w-lg text-sm leading-6 text-white/60">
              Quotes are based on date, guest count, and the mix of add-ons you want.
            </p>
          </Reveal>

          <Reveal delay={140} className="lg:pl-6">
            <PricingHeroVisual />
          </Reveal>
        </div>
      </section>

      <section id="tiers" className="bg-[#080706] py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionTitle
              eyebrow="Investment"
              title="Transparent tiers for your vision."
              copy="Whether you want the simple elegance of our Foundation room or the full production of our Showpiece package, we offer a clear path to the perfect event."
            />
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {pricingPlans.map((plan, index) => (
                <TierCard key={plan.name} plan={plan} index={index} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#050505] py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <div className="luxor-panel p-6 sm:p-8 lg:p-10">
              <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div className="max-w-2xl">
                  <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#d7b37a]">
                    Need a custom mix?
                  </p>
                  <h2 className="mt-4 font-serif text-4xl leading-[0.95] text-white sm:text-5xl lg:text-6xl">
                    We can tune the quote instead of forcing you into a box.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
                    If you want light decor but not the DJ, or you want to add a photo booth to Signature, we
                    can build the package around the event.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 lg:justify-end">
                  <Link
                    href="/#visit"
                    className="inline-flex items-center gap-2 border border-[#f1d27a]/40 bg-[#caa24c] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#050505] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    Ask for a custom quote
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 border border-[#caa24c]/28 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm transition-colors duration-200 hover:border-[#f1d27a]/50 hover:bg-[#caa24c]/10"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
