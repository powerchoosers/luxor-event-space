'use client'

import { ArrowRight } from '@/lib/icons/phosphor-compat'
import type { PublicPackagesSummaryLine } from '@/lib/luxorPublicPackagesConfigurator'

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
}

const copy = {
  en: {
    eyebrow: 'Your event total',
    total: 'Total estimate',
    mandatory: 'Mandatory',
    optional: 'Optional',
    inquire: 'Inquire about this event',
    loading: 'Updating price…',
    empty: 'Choose your event details to see pricing.',
  },
  es: {
    eyebrow: 'Total de tu evento',
    total: 'Estimado total',
    mandatory: 'Obligatorio',
    optional: 'Opcional',
    inquire: 'Consultar sobre este evento',
    loading: 'Actualizando precio…',
    empty: 'Elige los detalles de tu evento para ver el precio.',
  },
} as const

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
}: PackagesConfiguratorSummaryProps) {
  const t = copy[locale]
  const displayLines = lines.filter((line) => !['total', 'schedule'].includes(line.category))
  const reserveLine = lines.find((line) => line.category === 'reserve')
  const totalLine = lines.find((line) => line.category === 'total')

  return (
    <aside
      id={id}
      className={`min-w-0 rounded-md border border-[#caa24c]/22 bg-[#fffdfa] p-5 text-[#241d17] shadow-[0_24px_64px_-48px_rgba(48,33,14,0.35)] sm:p-6 ${compact ? '' : 'lg:sticky lg:top-28'}`}
    >
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#8d672b]">{t.eyebrow}</p>
      {loading ? (
        <p className="mt-4 text-sm text-[#665a4e]">{t.loading}</p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>
      ) : !displayLines.length ? (
        <p className="mt-4 text-sm leading-6 text-[#665a4e]">{t.empty}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {displayLines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-[#241d17]">{line.label}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a0907e]">
                  {line.obligation === 'mandatory' ? t.mandatory : t.optional}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[#241d17]">
                {money.format(line.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-[#eadfcf] pt-4">
        <div className="flex items-end justify-between gap-4">
          <p className="font-serif text-xl text-[#241d17]">{t.total}</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-[#8d672b]">
            {totalLine || total !== null ? money.format(totalLine?.amount ?? total ?? 0) : '—'}
          </p>
        </div>
        {reserveLine ? (
          <p className="mt-2 text-xs leading-5 text-[#665a4e]">
            {reserveLine.label}: <span className="font-semibold tabular-nums text-[#241d17]">{money.format(reserveLine.amount)}</span>
          </p>
        ) : null}
      </div>

      {onInquire ? (
        <button
          type="button"
          onClick={onInquire}
          disabled={inquireDisabled || loading || !total}
          className="luxor-gold-raised mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t.inquire} <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </aside>
  )
}
