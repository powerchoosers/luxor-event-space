'use client'

import type { PublicPackagesConfiguratorInput, PublicPackagesSummaryLine } from '@/lib/luxorPublicPackagesConfigurator'
import { listPublicPackageRentalPeriodOptions } from '@/lib/luxorPublicPackagesConfigurator'
import type { LuxorPublicPackageTierId } from '@/lib/luxorProposalPackages'
import { PackagesConfiguratorSummary } from '@/components/packages/PackagesConfiguratorSummary'

const tierCopy = {
  en: { essentials: 'Essentials', signature: 'Signature', luxor: 'Luxor' },
  es: { essentials: 'Esenciales', signature: 'Signature', luxor: 'Luxor' },
} as const

type PackagesInquiryEventSummaryProps = {
  locale?: 'en' | 'es'
  input: PublicPackagesConfiguratorInput
  summaryLines: PublicPackagesSummaryLine[]
  total: number | null
}

const copy = {
  en: {
    eyebrow: 'Your configured event',
    date: 'Event date',
    guests: 'Guest count',
    rental: 'Rental period',
    package: 'Package',
    eventType: 'Event type',
    enhancements: 'Enhancements',
    none: 'None selected',
  },
  es: {
    eyebrow: 'Tu evento configurado',
    date: 'Fecha del evento',
    guests: 'Invitados',
    rental: 'Periodo de renta',
    package: 'Paquete',
    eventType: 'Tipo de evento',
    enhancements: 'Mejoras',
    none: 'Ninguna seleccionada',
  },
} as const

export function PackagesInquiryEventSummary({
  locale = 'en',
  input,
  summaryLines,
  total,
}: PackagesInquiryEventSummaryProps) {
  const t = copy[locale]
  const rentalLabel = listPublicPackageRentalPeriodOptions(locale).find((option) => option.value === input.rentalPeriod)?.label
    || input.rentalPeriod.replace('_', ' ')
  const packageLabel = tierCopy[locale][input.packageTierId as LuxorPublicPackageTierId] || input.packageTierId
  const enhancements = summaryLines.filter((line) => line.category === 'enhancement').map((line) => line.label)

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[#caa24c]/22 bg-[#fffdfa] p-5 text-[#241d17] sm:p-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#8d672b]">{t.eyebrow}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[#827567]">{t.date}</dt><dd className="font-medium tabular-nums text-[#241d17]">{input.eventDate}</dd></div>
          <div><dt className="text-[#827567]">{t.guests}</dt><dd className="font-medium tabular-nums text-[#241d17]">{input.guestCount}</dd></div>
          {input.eventType ? <div className="sm:col-span-2"><dt className="text-[#827567]">{t.eventType}</dt><dd className="font-medium text-[#241d17]">{input.eventType}</dd></div> : null}
          <div className="sm:col-span-2"><dt className="text-[#827567]">{t.rental}</dt><dd className="font-medium text-[#241d17]">{rentalLabel}</dd></div>
          <div><dt className="text-[#827567]">{t.package}</dt><dd className="font-medium text-[#241d17]">{packageLabel}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[#827567]">{t.enhancements}</dt><dd className="font-medium text-[#241d17]">{enhancements.length ? enhancements.join(', ') : t.none}</dd></div>
        </dl>
      </section>
      <PackagesConfiguratorSummary locale={locale} lines={summaryLines} total={total} compact />
    </div>
  )
}
