'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Tag, Users } from '@/lib/icons/phosphor-compat'
import { isGuestCountOverCapacity, LUXOR_GUEST_CAPACITY_MESSAGE, LUXOR_GUEST_CAPACITY_MESSAGE_ES, LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'
import { PortalSelect } from '@/components/portal/PortalUI'
import { LuxorEventTypeCombobox } from '@/components/LuxorEventTypeCombobox'
import { PublicEventDatePicker } from '@/components/PublicEventDatePicker'
import { PackagesConfiguratorMobileSticky } from '@/components/packages/PackagesConfiguratorMobileSticky'
import { PackagesConfiguratorSummary } from '@/components/packages/PackagesConfiguratorSummary'
import type { PublicPackagesSummaryLine } from '@/lib/luxorPublicPackagesConfigurator'
import type { LuxorPublicPackageTierId } from '@/lib/luxorProposalPackages'
import { formatLocalDateKey, isLuxorDateSelectable } from '@/lib/publicEventDate'

type PackagesConfiguratorProps = {
  locale?: 'en' | 'es'
  defaultPackageTier?: LuxorPublicPackageTierId
}

type QuoteResponse = {
  quote?: {
    summaryLines: PublicPackagesSummaryLine[]
    totals: { totalEstimate: number | null }
    errors?: string[]
    enhancementOptions?: Array<{ id: string; name: string; amount: number; minimumQuantity: number; includedWithPackage: boolean }>
  }
  error?: string
}

type OptionsResponse = {
  guestCount?: { min: number; max: number }
  rentalPeriods?: Array<{ value: string; label: string }>
  packageTiers?: LuxorPublicPackageTierId[]
  error?: string
}

const PUBLIC_SELECT_BUTTON_CLASS = '!h-12 !rounded-xl !border-[#d8c4a4] !bg-white !px-4 !py-0 !text-left !text-sm !font-normal !text-[#241d17]'
const PUBLIC_DATE_CLASS = 'w-full [&>button]:h-12 [&>button]:rounded-xl [&>button]:px-4 [&>button]:py-0'

const tierCopy = {
  en: { essentials: 'Essentials', signature: 'Signature', luxor: 'Luxor' },
  es: { essentials: 'Esenciales', signature: 'Signature', luxor: 'Luxor' },
} as const

export function PackagesConfigurator({ locale = 'en', defaultPackageTier = 'signature' }: PackagesConfiguratorProps) {
  const router = useRouter()
  const [eventDate, setEventDate] = useState('')
  const [eventType, setEventType] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [rentalPeriod, setRentalPeriod] = useState('evening')
  const [packageTierId, setPackageTierId] = useState<LuxorPublicPackageTierId>(defaultPackageTier)
  const [enhancementQuantities, setEnhancementQuantities] = useState<Record<string, number>>({})
  const [guestBounds, setGuestBounds] = useState({ min: 1, max: LUXOR_MAX_GUESTS })
  const [rentalOptions, setRentalOptions] = useState<Array<{ value: string; label: string }>>([])
  const [summaryLines, setSummaryLines] = useState<PublicPackagesSummaryLine[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [enhancementOptions, setEnhancementOptions] = useState<Array<{ id: string; name: string; amount: number; minimumQuantity: number; includedWithPackage: boolean }>>([])
  const [loading, setLoading] = useState(false)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inquireBusy, setInquireBusy] = useState(false)
  const requestId = useRef(0)

  const labels = useMemo(() => ({
    en: {
      eventDate: 'Event date',
      eventType: 'Event type',
      guestCount: 'Guest count',
      rentalPeriod: 'Rental period',
      packageLevel: 'Package level',
      enhancements: 'Add enhancements (optional)',
      chooseDate: 'Choose a date',
      guestPlaceholder: 'For example, 120',
      guestInvalid: 'Enter a whole guest count between 1 and 180.',
    },
    es: {
      eventDate: 'Fecha del evento',
      eventType: 'Tipo de evento',
      guestCount: 'Invitados',
      rentalPeriod: 'Periodo de renta',
      packageLevel: 'Nivel de paquete',
      enhancements: 'Agrega mejoras (opcional)',
      chooseDate: 'Elige una fecha',
      guestPlaceholder: 'Por ejemplo, 120',
      guestInvalid: 'Ingresa un número de invitados entre 1 y 180.',
    },
  }[locale]), [locale])

  const guestInvalid = guestCount !== '' && (
    !Number.isInteger(Number(guestCount))
    || Number(guestCount) < guestBounds.min
    || Number(guestCount) > guestBounds.max
    || isGuestCountOverCapacity(guestCount)
  )

  useEffect(() => {
    let active = true
    void fetch(`/api/public/packages-pricing?locale=${encodeURIComponent(locale)}`, { cache: 'no-store' })
      .then(async (response) => response.json() as Promise<OptionsResponse>)
      .then((data) => {
        if (!active) return
        if (data.guestCount) setGuestBounds(data.guestCount)
        if (data.rentalPeriods?.length) setRentalOptions(data.rentalPeriods)
        if (!guestCount) setGuestCount('100')
        setOptionsLoading(false)
      })
      .catch(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [locale])

  const recalculate = useCallback(async () => {
    if (!eventDate || !guestCount || guestInvalid || !rentalPeriod || !packageTierId) {
      setSummaryLines([])
      setTotal(null)
      setError(null)
      return
    }
    const current = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/public/packages-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          eventDate,
          eventType,
          guestCount: Number(guestCount),
          rentalPeriod,
          packageTierId,
          decorAddOnQuantities: enhancementQuantities,
          browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await response.json() as QuoteResponse
      if (current !== requestId.current) return
      if (!response.ok) throw new Error(data.error || 'Pricing is temporarily unavailable.')
      const quote = data.quote
      setSummaryLines(quote?.summaryLines || [])
      setTotal(quote?.totals?.totalEstimate ?? null)
      setEnhancementOptions(quote?.enhancementOptions || [])
      const quoteError = quote?.errors?.find(Boolean)
      setError(quoteError || null)
    } catch (err) {
      if (current !== requestId.current) return
      setSummaryLines([])
      setTotal(null)
      setError(err instanceof Error ? err.message : 'Pricing is temporarily unavailable.')
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [enhancementQuantities, eventDate, eventType, guestCount, guestInvalid, locale, packageTierId, rentalPeriod])

  useEffect(() => {
    const timer = window.setTimeout(() => { void recalculate() }, 220)
    return () => window.clearTimeout(timer)
  }, [recalculate])

  async function handleInquire() {
    if (!eventDate || !guestCount || guestInvalid || !total) return
    setInquireBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/public/packages-inquiry/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          eventDate,
          eventType,
          guestCount: Number(guestCount),
          rentalPeriod,
          packageTierId,
          decorAddOnQuantities: enhancementQuantities,
          browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await response.json() as { error?: string; token?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to continue to inquiry.')
      const base = locale === 'es' ? '/es/packages/inquiry' : '/packages/inquiry'
      router.push(`${base}?token=${encodeURIComponent(data.token || '')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue to inquiry.')
    } finally {
      setInquireBusy(false)
    }
  }

  const tiers: LuxorPublicPackageTierId[] = ['essentials', 'signature', 'luxor']

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
        <div className="rounded-2xl border border-[#caa24c]/22 bg-white/85 p-5 text-[#241d17] sm:p-6 lg:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-1">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                <CalendarDays className="h-4 w-4 text-[#caa24c]" aria-hidden /> {labels.eventDate}
              </span>
              <PublicEventDatePicker
                value={eventDate}
                onChange={setEventDate}
                placeholder={labels.chooseDate}
                className={PUBLIC_DATE_CLASS}
                popoverSurface="public-glass"
              />
            </label>
            <LuxorEventTypeCombobox
              label={labels.eventType}
              variant="public-light"
              locale={locale}
              popoverSurface="public-glass"
              value={eventType}
              onChange={setEventType}
              className="block sm:col-span-1"
              labelClassName="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]"
              inputClassName="h-12 rounded-xl border border-[#d8c4a4] bg-white px-4 text-sm text-[#241d17]"
            />
            <label className="block sm:col-span-1">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                <Users className="h-4 w-4 text-[#caa24c]" aria-hidden /> {labels.guestCount}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={guestBounds.min}
                max={guestBounds.max}
                step={1}
                value={guestCount}
                onChange={(event) => setGuestCount(event.target.value)}
                disabled={optionsLoading}
                placeholder={labels.guestPlaceholder}
                className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-white px-4 text-sm text-[#241d17] outline-none placeholder:text-[#a0907e] focus:border-[#b98a3d]"
              />
              {guestInvalid ? (
                <p role="alert" className="mt-2 text-xs leading-5 text-[#f1d27a]">
                  {isGuestCountOverCapacity(guestCount)
                    ? (locale === 'es' ? LUXOR_GUEST_CAPACITY_MESSAGE_ES : LUXOR_GUEST_CAPACITY_MESSAGE)
                    : labels.guestInvalid}
                </p>
              ) : null}
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                <Clock className="h-4 w-4 text-[#caa24c]" aria-hidden /> {labels.rentalPeriod}
              </span>
              <PortalSelect
                value={rentalPeriod}
                onChange={setRentalPeriod}
                options={rentalOptions.map((option) => ({ value: option.value, label: option.label }))}
                disabled={optionsLoading || !rentalOptions.length}
                theme="light"
                popoverSurface="public-glass"
                className="w-full"
                buttonClassName={PUBLIC_SELECT_BUTTON_CLASS}
              />
            </label>
          </div>

          <div className="mt-8">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
              <Tag className="h-4 w-4 text-[#caa24c]" aria-hidden /> {labels.packageLevel}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {tiers.map((tier) => {
                const active = packageTierId === tier
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setPackageTierId(tier)}
                    className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition ${active ? 'border-[#caa24c] bg-[#caa24c]/16 text-[#241d17]' : 'border-[#d8c4a4] bg-white text-[#665a4e] hover:border-[#caa24c]/45'}`}
                  >
                    {tierCopy[locale][tier]}
                  </button>
                )
              })}
            </div>
          </div>

          {enhancementOptions?.length ? (
            <div className="mt-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{labels.enhancements}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {enhancementOptions.filter((item) => !item.includedWithPackage).map((item) => {
                  const checked = Boolean(enhancementQuantities[item.id])
                  return (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#eadfcf] bg-[#fffdfa] px-3 py-3 text-sm text-[#241d17]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setEnhancementQuantities((current) => {
                              const next = { ...current }
                              if (event.target.checked) next[item.id] = item.minimumQuantity
                              else delete next[item.id]
                              return next
                            })
                          }}
                          className="mt-1 accent-[#caa24c]"
                        />
                        <span>
                          <span className="font-medium">{item.name}</span>
                          <span className="mt-0.5 block text-xs tabular-nums text-[#8d672b]">
                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <PackagesConfiguratorSummary
          locale={locale}
          lines={summaryLines}
          total={total}
          loading={loading}
          error={error}
          onInquire={handleInquire}
          inquireDisabled={inquireBusy || guestInvalid || !isLuxorDateSelectable(eventDate, formatLocalDateKey(new Date()))}
        />
      </div>

      <PackagesConfiguratorMobileSticky locale={locale} total={total} />
    </>
  )
}
