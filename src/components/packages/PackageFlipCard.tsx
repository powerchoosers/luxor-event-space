'use client'

import Image from 'next/image'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Check, X } from '@/lib/icons/phosphor-compat'
import { motion, useReducedMotion } from 'framer-motion'
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
    weekendFromLabel: 'Fri–Sun from',
    viewPackage: (name: string) => `View ${name} package`,
    back: 'Back',
    included: 'What’s included',
    details: 'Details and limitations',
    notIncluded: 'Not included',
  },
  es: {
    weekendFromLabel: 'Vie–Dom desde',
    viewPackage: (name: string) => `Ver paquete ${name}`,
    back: 'Atrás',
    included: 'Qué incluye',
    details: 'Detalles y limitaciones',
    notIncluded: 'No incluido',
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
  const backScrollRef = useRef<HTMLDivElement>(null)

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

  const notIncludedPattern = /^\s*(not included|no incluido)\s*:\s*/i
  const limitNotes = data.limitations.filter((item) => !notIncludedPattern.test(item))
  const limitExcluded = data.limitations
    .filter((item) => notIncludedPattern.test(item))
    .map((item) => item.replace(notIncludedPattern, ''))
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

  const shellClass =
    'rounded-2xl border border-[#caa24c]/22 bg-[#0a0807] shadow-[0_34px_90px_-62px_rgba(0,0,0,1)]'
  const shellClipClass = 'overflow-hidden'
  const sizerShellClass = 'overflow-hidden rounded-2xl bg-[#0a0807]'
  const faceClipClass = 'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[#0a0807]'
  const backfaceClass = '[backface-visibility:hidden] [-webkit-backface-visibility:hidden]'
  const imageShellClass = 'relative min-h-52 overflow-hidden rounded-t-2xl'

  useEffect(() => {
    if (showSwapLayout || !flipped || !allow3dFlip) return
    const scrollEl = backScrollRef.current
    if (!scrollEl) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
      scrollEl.scrollTop = Math.max(0, Math.min(maxScroll, scrollEl.scrollTop + event.deltaY))
    }

    scrollEl.addEventListener('wheel', onWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', onWheel)
  }, [allow3dFlip, flipped, showSwapLayout])

  const renderFront = (options?: { hidden?: boolean; sizeFromContent?: boolean }) => (
    <div className={`flex flex-col ${options?.sizeFromContent ? 'w-full' : 'h-full min-h-0'}`} hidden={options?.hidden}>
      <div className={imageShellClass}>
        <Image
          src={data.image}
          alt={data.imageAlt}
          fill
          sizes="(min-width: 1024px) 30vw, 100vw"
          className="rounded-t-2xl object-cover"
        />
        <div className="absolute inset-0 rounded-t-2xl bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.52))]" />
        {data.mostPopular ? (
          <p className="absolute right-3 top-3 rounded-md border border-[#caa24c]/30 bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#f1d27a]">
            {data.mostPopular.replace(/⭐\s*/, '')}
          </p>
        ) : null}
      </div>
      <div className={`flex flex-col p-6 sm:p-7 ${options?.sizeFromContent ? '' : 'min-h-0 flex-1'}`}>
        <h3 className="font-serif text-4xl leading-none text-[#f7efe3]">{data.displayName}</h3>
        <p className="mt-4 text-sm leading-6 text-[#d7c29a]/72 sm:text-base">{data.shortDescription}</p>
        {data.showStartingPrice && data.startingPrice !== null ? (
          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#caa24c]">{t.weekendFromLabel}</p>
            <p className="mt-1 font-serif text-4xl leading-none text-[#f1d27a]">{formatPrice(data.startingPrice)}</p>
          </div>
        ) : null}
        <ul className={`grid gap-3 ${data.showStartingPrice ? 'mt-6' : 'mt-5'}`}>
          {data.previewInclusions.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-[#d7c29a]/78">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#caa24c]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full pt-6">
        <button
          ref={frontControlRef}
          type="button"
          onClick={flipToBack}
          aria-expanded={flipped}
          aria-controls={`${faceId}-back`}
          className="luxor-gold-raised inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-[11px] uppercase tracking-[0.14em]"
        >
          {t.viewPackage(data.displayName)} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        </div>
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
      className="flex h-full max-h-full min-h-0 flex-col"
      hidden={options?.hidden}
    >
      <div
        ref={options?.scrollBody ? backScrollRef : undefined}
        data-luxor-package-back-scroll={options?.scrollBody ? 'true' : undefined}
        className={`flex min-h-0 flex-col px-6 pt-6 sm:px-7 sm:pt-7 max-lg:scroll-mt-28 max-lg:pt-8 ${options?.scrollBody ? 'min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]' : ''}`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#caa24c]">{data.displayName}</p>
        <h3
          id={`${faceId}-back-heading`}
          className="mt-3 scroll-mt-28 font-serif text-3xl leading-none text-[#f7efe3]"
        >
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
        {limitNotes.length > 0 ? (
          <div className="mt-3 space-y-1 rounded-md border border-[#caa24c]/25 bg-[#caa24c]/8 px-3 py-2 text-sm leading-6 text-[#d7c29a]/85">
            {limitNotes.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}
        {limitExcluded.length > 0 ? (
          <>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[#caa24c]">{t.notIncluded}</p>
            <ul className="mt-2 space-y-2 pb-2 text-sm leading-6 text-[#d7c29a]/72">
              {limitExcluded.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <X className="mt-1 h-3.5 w-3.5 shrink-0 text-[#e8928f]" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div className="shrink-0 rounded-b-2xl border-t border-[#caa24c]/16 bg-[#0a0807] p-6 sm:p-7 sm:pt-5">
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

  if (showSwapLayout) {
    const showFront = activeFace === 'front'
    const showBack = activeFace === 'back'
    return (
      <article
        className={`${shellClass} ${shellClipClass} relative flex h-full flex-col`}
        aria-labelledby={`${faceId}-title`}
      >
        <span id={`${faceId}-title`} className="sr-only">
          {data.displayName} package {activeFace}
        </span>
        <div className="relative h-full min-h-0 w-full flex-1">
          <motion.div
            className={`relative flex h-full w-full min-h-0 flex-col ${
              showBack ? 'invisible pointer-events-none' : 'pointer-events-auto'
            }`}
            aria-hidden={showBack}
            {...(showBack ? { inert: true } : {})}
            initial={false}
            animate={{ opacity: showFront ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <div className={faceClipClass}>{renderFront()}</div>
          </motion.div>
          <motion.div
            className={`absolute inset-0 flex h-full max-h-full min-h-0 flex-col ${
              showFront ? 'pointer-events-none invisible' : 'pointer-events-auto z-[2]'
            }`}
            aria-hidden={showFront}
            {...(showFront ? { inert: true } : {})}
            initial={false}
            animate={{ opacity: showBack ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <div className={faceClipClass}>{renderBack({ scrollBody: true })}</div>
          </motion.div>
        </div>
      </article>
    )
  }

  return (
    <article className={`group grid h-full w-full ${shellClass}`} aria-labelledby={`${faceId}-title`}>
      <span id={`${faceId}-title`} className="sr-only">
        {data.displayName} package
      </span>
      <div className="pointer-events-none invisible [grid-area:1/1] w-full min-w-0" aria-hidden inert>
        <div className={sizerShellClass}>{renderFront({ sizeFromContent: true })}</div>
      </div>
      <div className="relative [grid-area:1/1] min-w-0 self-stretch [perspective:1200px]">
        <div
          className={`absolute inset-0 w-full transition-transform duration-500 ease-in-out [transform-style:preserve-3d] ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          <div
            className={`absolute inset-0 flex min-h-0 w-full flex-col ${backfaceClass} ${
              flipped
                ? 'pointer-events-none invisible transition-[visibility] delay-500 duration-0'
                : 'pointer-events-auto visible z-[2] transition-[visibility] delay-0 duration-0'
            }`}
            aria-hidden={flipped}
            {...(flipped ? { inert: true } : {})}
          >
            <div className={faceClipClass}>{renderFront()}</div>
          </div>
          <div
            className={`absolute inset-0 flex min-h-0 w-full flex-col ${backfaceClass} [transform:rotateY(180deg)] ${
              flipped
                ? 'pointer-events-auto visible z-[3] transition-[visibility] delay-0 duration-0'
                : 'pointer-events-none invisible transition-[visibility] delay-500 duration-0'
            }`}
            aria-hidden={!flipped}
            {...(!flipped ? { inert: true } : {})}
          >
            <div className={faceClipClass}>{renderBack({ scrollBody: true })}</div>
          </div>
        </div>
      </div>
    </article>
  )
}
