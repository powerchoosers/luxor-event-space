'use client'

import Image from 'next/image'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Check } from '@/lib/icons/phosphor-compat'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { PublicPackageCardData } from '@/lib/luxorPublicPackages'

type PackageFlipCardProps = {
  data: PublicPackageCardData
  locale?: 'en' | 'es'
}

export function nextPackageCardFace(flipped: boolean): 'front' | 'back' {
  return flipped ? 'back' : 'front'
}

function formatPrice(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const copy = {
  en: {
    weekendFromPrice: (price: string) => `Fri–Sun from ${price}`,
    viewPackage: (name: string) => `View ${name} package`,
    back: 'Back',
    included: 'What’s included',
    details: 'Details and limitations',
  },
  es: {
    weekendFromPrice: (price: string) => `Vie–Dom desde ${price}`,
    viewPackage: (name: string) => `Ver paquete ${name}`,
    back: 'Atrás',
    included: 'Qué incluye',
    details: 'Detalles y limitaciones',
  },
} as const

export function PackageFlipCard({ data, locale = 'en' }: PackageFlipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [allow3dFlip, setAllow3dFlip] = useState(false)
  const reduceMotion = useReducedMotion() ?? false
  const faceId = useId()
  const t = copy[locale]
  const activeFace = nextPackageCardFace(flipped)
  const frontControlRef = useRef<HTMLButtonElement>(null)
  const backControlRef = useRef<HTMLButtonElement>(null)
  const backPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const widthQuery = window.matchMedia('(min-width: 1024px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setAllow3dFlip(widthQuery.matches && !motionQuery.matches && !reduceMotion)
    sync()
    widthQuery.addEventListener('change', sync)
    motionQuery.addEventListener('change', sync)
    return () => {
      widthQuery.removeEventListener('change', sync)
      motionQuery.removeEventListener('change', sync)
    }
  }, [reduceMotion])

  const showSwapLayout = !allow3dFlip

  const flipToBack = useCallback(() => {
    setFlipped(true)
    window.requestAnimationFrame(() => {
      backControlRef.current?.focus()
    })
  }, [])

  const flipToFront = useCallback(() => {
    setFlipped(false)
    window.requestAnimationFrame(() => {
      frontControlRef.current?.focus()
    })
  }, [])

  const renderFront = (options?: { hidden?: boolean }) => (
    <div className="flex h-full flex-col" hidden={options?.hidden}>
      <div className="relative min-h-52 overflow-hidden">
        <Image src={data.image} alt={data.imageAlt} fill sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.52))]" />
        {data.mostPopular ? (
          <p className="absolute right-3 top-3 rounded-md border border-[#caa24c]/30 bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#f1d27a]">
            {data.mostPopular.replace(/⭐\s*/, '')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <h3 className="font-serif text-4xl leading-none text-[#f7efe3]">{data.displayName}</h3>
        <p className="mt-4 text-sm leading-6 text-[#d7c29a]/72 sm:text-base">{data.shortDescription}</p>
        {data.showStartingPrice && data.startingPrice !== null ? (
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#caa24c]">
            {t.weekendFromPrice(formatPrice(data.startingPrice))}
          </p>
        ) : null}
        <ul className={`grid gap-3 ${data.showStartingPrice ? 'mt-6' : 'mt-5'}`}>
          {data.previewInclusions.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-[#d7c29a]/78">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#caa24c]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <button
          ref={frontControlRef}
          type="button"
          onClick={flipToBack}
          aria-expanded={flipped}
          aria-controls={`${faceId}-back`}
          className="luxor-gold-raised mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-[11px] uppercase tracking-[0.14em]"
        >
          {t.viewPackage(data.displayName)} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )

  const renderBack = (options?: { scrollBody?: boolean; hidden?: boolean }) => (
    <div
      id={`${faceId}-back`}
      ref={backPanelRef}
      role="region"
      aria-labelledby={`${faceId}-back-heading`}
      tabIndex={-1}
      className="flex h-full flex-col"
      hidden={options?.hidden}
    >
      <div className={`flex flex-col px-6 pt-6 sm:px-7 sm:pt-7 ${options?.scrollBody ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#caa24c]">{data.displayName}</p>
        <h3 id={`${faceId}-back-heading`} className="mt-3 font-serif text-3xl leading-none text-[#f7efe3]">
          {t.included}
        </h3>
        <ul className="mt-4 space-y-2 text-sm text-[#d7c29a]/85">
          {data.fullInclusions.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#caa24c]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 font-serif text-2xl leading-none text-[#f7efe3]">{t.details}</h3>
        <ul className="mt-3 space-y-2 pb-2 text-sm leading-6 text-[#d7c29a]/72">
          {data.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="border-t border-[#caa24c]/16 bg-[#0a0807] p-6 sm:p-7 sm:pt-5">
        <button
          ref={backControlRef}
          type="button"
          onClick={flipToFront}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border-2 border-[#caa24c]/55 bg-[#120d0c] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3] transition hover:border-[#caa24c]/80 hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]"
        >
          {t.back}
        </button>
      </div>
    </div>
  )

  const shellClass = 'rounded-md border border-[#caa24c]/22 bg-[#0a0807] shadow-[0_34px_90px_-62px_rgba(0,0,0,1)]'

  if (showSwapLayout) {
    return (
      <article className={`${shellClass} h-full`} aria-labelledby={`${faceId}-title`}>
        <span id={`${faceId}-title`} className="sr-only">
          {data.displayName} package {activeFace}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeFace}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            {activeFace === 'front' ? renderFront() : renderBack()}
          </motion.div>
        </AnimatePresence>
      </article>
    )
  }

  return (
    <article className={`group h-full [perspective:1200px] ${shellClass}`} aria-labelledby={`${faceId}-title`}>
      <span id={`${faceId}-title`} className="sr-only">
        {data.displayName} package
      </span>
      <div
        className={`relative h-full min-h-[560px] transition-transform duration-500 ease-in-out [transform-style:preserve-3d] ${
          flipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <div
          className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
          aria-hidden={flipped}
          {...(flipped ? { inert: true } : {})}
        >
          {renderFront()}
        </div>
        <div
          className="absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-hidden={!flipped}
          {...(!flipped ? { inert: true } : {})}
        >
          <div className="flex h-full min-h-[560px] flex-col">
            {renderBack({ scrollBody: true })}
          </div>
        </div>
      </div>
    </article>
  )
}
