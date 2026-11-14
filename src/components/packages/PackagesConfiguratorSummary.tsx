'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronDown } from '@/lib/icons/phosphor-compat'
import type { PublicPackagesSummaryLine } from '@/lib/luxorPublicPackagesConfigurator'
import { AnimatedCurrencyTicker } from '@/components/packages/AnimatedCurrencyTicker'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

type PackagesConfiguratorSummaryProps = {
  locale?: 'en' | 'es'
  lines: PublicPackagesSummaryLine[]
  total: number | null
  loading?: boolean
  error?: string | null
  onInquire?: () => void
  inquireDisabled?: boolean
  compact?: boolean
  id?: string
  submitLabel?: string
  variant?: 'light' | 'dark'
}

const copy = {
  en: {
    eyebrow: 'Your event total',
    total: 'Total estimate',
    mandatory: 'Mandatory',
    optional: 'Optional',
    inquire: 'Inquire about this event',
    payments: 'Payment schedule',
    loading: 'Building your estimate…',
    empty: 'Choose your event details to see pricing.',
    showBreakdown: 'View itemized breakdown',
    hideBreakdown: 'Hide itemized breakdown',
  },
  es: {
    eyebrow: 'Total de tu evento',
    total: 'Estimado total',
    mandatory: 'Obligatorio',
    optional: 'Opcional',
    inquire: 'Consultar sobre este evento',
    payments: 'Calendario de pagos',
    loading: 'Preparando tu estimado…',
    empty: 'Elige los detalles de tu evento para ver el precio.',
    showBreakdown: 'Ver desglose detallado',
    hideBreakdown: 'Ocultar desglose detallado',
  },
} as const

const CHARGE_CATEGORIES = new Set<PublicPackagesSummaryLine['category']>([
  'venue',
  'package',
  'cleaning',
  'security',
  'enhancement',
  'other',
  'tax',
])

function renderLines(lines: PublicPackagesSummaryLine[], mandatoryLabel: string, optionalLabel: string, reduceMotion: boolean | null) {
  if (!lines.length) return null
  return (
    <ul>
      <AnimatePresence initial={false}>
      {lines.map((line) => (
        <motion.li key={line.id} layout={!reduceMotion} initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeInOut' }} className="overflow-hidden text-sm">
          <motion.div
            initial={line.category === 'enhancement' && !reduceMotion ? { outlineColor: 'rgba(185,138,61,0.7)' } : false}
            animate={{ outlineColor: 'rgba(185,138,61,0)' }}
            transition={{ duration: 2, delay: 0.25 }}
            className="-outline-offset-1 flex items-start justify-between gap-4 rounded-lg px-3 py-2 outline outline-1 outline-dashed outline-transparent"
          >
          <div className="min-w-0">
            <p className="font-semibold leading-5">{line.label}</p>
            {line.detail ? <p className="mt-1 text-xs leading-5 opacity-75">{line.detail}</p> : null}
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-65">
              {line.obligation === 'mandatory' ? mandatoryLabel : optionalLabel}
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
            {money.format(line.amount)}
          </p>
          </motion.div>
        </motion.li>
      ))}
      </AnimatePresence>
    </ul>
  )
}

export function PackagesConfiguratorSummary({
  locale = 'en',
  lines,
  total,
  loading,
  error,
  onInquire,
  inquireDisabled,
  compact,
  id = 'packages-summary',
  submitLabel,
  variant = 'light',
}: PackagesConfiguratorSummaryProps) {
  const t = copy[locale]
  const dark = variant === 'dark'
  const reduceMotion = useReducedMotion()
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const chargeLines = lines.filter((line) => CHARGE_CATEGORIES.has(line.category))
  const depositLine = lines.find((line) => line.category === 'deposit')
  const reserveLine = lines.find((line) => line.category === 'reserve')
  const balanceLine = lines.find((line) => line.category === 'balance')
  const scheduleLines = lines.filter((line) => line.category === 'schedule')
  const totalLine = lines.find((line) => line.category === 'total')
  const summaryTail = [depositLine, reserveLine, balanceLine].filter(Boolean) as PublicPackagesSummaryLine[]
  const empty = !error && !lines.length

  const shellClass = dark
    ? 'border-[#caa24c]/22 bg-black/30 text-[#f7efe3] shadow-[0_24px_64px_-48px_rgba(0,0,0,0.55)]'
    : 'border-[#caa24c]/22 bg-[#fffdfa] text-[#241d17] shadow-[0_24px_64px_-48px_rgba(48,33,14,0.35)]'
  const mutedClass = dark ? 'text-[#d7c29a]/72' : 'text-[#665a4e]'
  const eyebrowClass = dark ? 'text-[#f1d27a]' : 'text-[#8d672b]'
  const dividerClass = dark ? 'border-[#caa24c]/20' : 'border-[#eadfcf]'
  const totalValueClass = dark ? 'text-[#f1d27a]' : 'text-[#8d672b]'

  const breakdownContent = (
    <div className="space-y-5">
      {renderLines(chargeLines, t.mandatory, t.optional, reduceMotion)}
      {summaryTail.length ? (
        <div className={`space-y-3 border-t pt-4 ${dividerClass}`}>
          {renderLines(summaryTail, t.mandatory, t.optional, reduceMotion)}
        </div>
      ) : null}
      {scheduleLines.length ? (
        <div className={`space-y-3 border-t pt-4 ${dividerClass}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${eyebrowClass}`}>{t.payments}</p>
          {renderLines(scheduleLines, t.mandatory, t.optional, reduceMotion)}
        </div>
      ) : null}
    </div>
  )

  return (
    <motion.aside
      id={id}
      layout={reduceMotion ? false : 'size'}
      transition={{ layout: { duration: reduceMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] } }}
      className={`min-w-0 scroll-mt-[calc(7rem+1.25rem)] rounded-2xl border p-5 sm:p-6 ${shellClass} ${compact ? '' : `lg:sticky lg:top-[8.75rem] lg:scroll-mt-0 lg:max-xl:pb-5 xl:top-28 xl:pb-6 ${empty ? 'lg:flex lg:flex-col lg:self-stretch' : ''}`}`}
    >
      {/* Header: eyebrow label + on mobile, a toggle button */}
      <div className="flex items-center justify-between gap-3">
        <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.22em] ${eyebrowClass}`}>{t.eyebrow}</p>
        {lines.length ? (
          <button
            type="button"
            onClick={() => setMobileExpanded((prev) => !prev)}
            aria-expanded={mobileExpanded}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-[#caa24c]/10 sm:hidden ${eyebrowClass}`}
          >
            <span>{mobileExpanded ? t.hideBreakdown : t.showBreakdown}</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${mobileExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {/* Main Breakdown Section: Desktop (sm+) is always visible; Mobile (<sm) expands/collapses with animation */}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>
      ) : !lines.length ? (
        <div>
          <div className="relative mt-4 h-6 text-sm leading-6" aria-live="polite">
            <AnimatePresence initial={false} mode="wait">
              {loading ? (
                <motion.p
                  key="building"
                  initial={{ opacity: 0 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, backgroundPosition: ['200% 0', '-200% 0'] }}
                  exit={{ opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { opacity: { duration: 0.15 }, backgroundPosition: { duration: 1.8, repeat: Infinity, ease: 'linear' } }}
                  className="font-medium text-[#8d672b]"
                  style={reduceMotion ? undefined : { backgroundImage: 'linear-gradient(100deg, #8d672b 20%, #e8cc8c 45%, #8d672b 70%)', backgroundSize: '200% 100%', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                >{t.loading}</motion.p>
              ) : (
                <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.12 }} className={mutedClass}>{t.empty}</motion.p>
              )}
            </AnimatePresence>
          </div>
          <div aria-hidden="true" className="mt-4 space-y-3">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <span className={`h-2.5 rounded-full ${row === 0 ? 'w-28' : 'w-20'} ${dark ? 'bg-white/10' : 'bg-[#eadfcf]'}`} />
                <span className={`h-2.5 w-12 rounded-full ${dark ? 'bg-white/10' : 'bg-[#eadfcf]'}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop view: always expanded */}
          <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.3 }} className="mt-5 hidden sm:block">
            {breakdownContent}
          </motion.div>

          {/* Mobile view: animated expand/collapse, collapsed by default */}
          <div className="sm:hidden">
            <AnimatePresence initial={false}>
              {mobileExpanded ? (
                <motion.div
                  key="mobile-breakdown"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{
                    opacity: 1,
                    height: 'auto',
                    transition: {
                      height: { duration: reduceMotion ? 0.05 : 0.52, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: reduceMotion ? 0.05 : 0.38, delay: reduceMotion ? 0 : 0.08, ease: 'easeOut' },
                    },
                  }}
                  exit={reduceMotion ? { opacity: 0 } : {
                    opacity: 0,
                    height: 0,
                    transition: {
                      height: { duration: reduceMotion ? 0.04 : 0.44, ease: [0.25, 0.1, 0.25, 1] },
                      opacity: { duration: reduceMotion ? 0.04 : 0.24, ease: 'easeIn' },
                    },
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 pt-1">
                    {breakdownContent}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Total estimate and inquiry button: Always easily seen without having to scroll down on mobile */}
      <div className={`mt-5 border-t pt-4 ${empty && !compact ? 'lg:mt-auto' : ''} ${dividerClass}`}>
        <div className="flex items-end justify-between gap-4">
          <p className="font-serif text-xl">{t.total}</p>
          <p className={`font-mono text-2xl font-bold tabular-nums ${totalValueClass}`}>
            <AnimatedCurrencyTicker value={totalLine ? totalLine.amount : total} />
          </p>
        </div>
      </div>

      {onInquire ? (
        <button
          type="button"
          onClick={onInquire}
          disabled={inquireDisabled || loading || !total}
          className="luxor-gold-raised relative z-[1] mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] sm:px-5 sm:text-xs sm:tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitLabel || t.inquire} <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </motion.aside>
  )
}
