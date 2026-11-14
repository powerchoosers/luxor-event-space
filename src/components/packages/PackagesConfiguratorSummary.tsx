'use client'

import { ArrowRight } from '@/lib/icons/phosphor-compat'
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
    loading: 'Updating price…',
    empty: 'Choose your event details to see pricing.',
  },
  es: {
    eyebrow: 'Total de tu evento',
    total: 'Estimado total',
    mandatory: 'Obligatorio',
    optional: 'Opcional',
    inquire: 'Consultar sobre este evento',
    payments: 'Calendario de pagos',
    loading: 'Actualizando precio…',
    empty: 'Elige los detalles de tu evento para ver el precio.',
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

function renderLines(lines: PublicPackagesSummaryLine[], mandatoryLabel: string, optionalLabel: string) {
  if (!lines.length) return null
  return (
    <ul className="space-y-3">
      {lines.map((line) => (
        <li key={line.id} className="flex items-start justify-between gap-4 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{line.label}</p>
            {line.detail ? <p className="mt-0.5 text-xs leading-5 opacity-80">{line.detail}</p> : null}
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-65">
              {line.obligation === 'mandatory' ? mandatoryLabel : optionalLabel}
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
            {money.format(line.amount)}
          </p>
        </li>
      ))}
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
  const chargeLines = lines.filter((line) => CHARGE_CATEGORIES.has(line.category))
  const depositLine = lines.find((line) => line.category === 'deposit')
  const reserveLine = lines.find((line) => line.category === 'reserve')
  const balanceLine = lines.find((line) => line.category === 'balance')
  const scheduleLines = lines.filter((line) => line.category === 'schedule')
  const totalLine = lines.find((line) => line.category === 'total')
  const summaryTail = [depositLine, reserveLine, balanceLine].filter(Boolean) as PublicPackagesSummaryLine[]

  const shellClass = dark
    ? 'border-[#caa24c]/22 bg-black/30 text-[#f7efe3] shadow-[0_24px_64px_-48px_rgba(0,0,0,0.55)]'
    : 'border-[#caa24c]/22 bg-[#fffdfa] text-[#241d17] shadow-[0_24px_64px_-48px_rgba(48,33,14,0.35)]'
  const mutedClass = dark ? 'text-[#d7c29a]/72' : 'text-[#665a4e]'
  const eyebrowClass = dark ? 'text-[#f1d27a]' : 'text-[#8d672b]'
  const dividerClass = dark ? 'border-[#caa24c]/20' : 'border-[#eadfcf]'
  const totalValueClass = dark ? 'text-[#f1d27a]' : 'text-[#8d672b]'

  return (
    <aside
      id={id}
      className={`min-w-0 scroll-mt-[calc(7rem+1.25rem)] rounded-2xl border p-5 sm:p-6 ${shellClass} ${compact ? '' : 'lg:sticky lg:top-[8.75rem] lg:scroll-mt-0 lg:max-xl:pb-5 xl:top-28 xl:pb-6 xl:pr-44'}`}
    >
      <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.22em] ${eyebrowClass}`}>{t.eyebrow}</p>
      {loading ? (
        <p className={`mt-4 text-sm ${mutedClass}`}>{t.loading}</p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>
      ) : !lines.length ? (
        <p className={`mt-4 text-sm leading-6 ${mutedClass}`}>{t.empty}</p>
      ) : (
        <div className="mt-5 space-y-5">
          {renderLines(chargeLines, t.mandatory, t.optional)}
          {summaryTail.length ? (
            <div className={`space-y-3 border-t pt-4 ${dividerClass}`}>
              {renderLines(summaryTail, t.mandatory, t.optional)}
            </div>
          ) : null}
          {scheduleLines.length ? (
            <div className={`space-y-3 border-t pt-4 ${dividerClass}`}>
              <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${eyebrowClass}`}>{t.payments}</p>
              {renderLines(scheduleLines, t.mandatory, t.optional)}
            </div>
          ) : null}
        </div>
      )}

      <div className={`mt-5 border-t pt-4 ${dividerClass}`}>
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
    </aside>
  )
}
