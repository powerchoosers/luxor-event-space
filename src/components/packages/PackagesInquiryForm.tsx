'use client'

import { FormEvent, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from '@/lib/icons/phosphor-compat'
import {
  LUXOR_INQUIRY_EMAIL_DISCLOSURE,
  LUXOR_INQUIRY_SMS_DISCLOSURE,
  LUXOR_MARKETING_EMAIL_DISCLOSURE,
  LUXOR_MARKETING_SMS_DISCLOSURE,
} from '@/lib/luxorInquiryTypes'
import { submitLuxorIdempotentForm } from '@/lib/luxorSubmissionIdempotency'
import { getLuxorPublicSessionId } from '@/lib/luxorPublicAttribution'
import type { PublicPackagesConfiguratorInput, PublicPackagesSummaryLine } from '@/lib/luxorPublicPackagesConfigurator'
import { PackagesInquiryEventSummary } from '@/components/packages/PackagesInquiryEventSummary'

type DraftPayload = {
  configuratorInput?: PublicPackagesConfiguratorInput
  quote?: {
    summary_lines?: PublicPackagesSummaryLine[]
    summaryLines?: PublicPackagesSummaryLine[]
    totals?: { totalEstimate?: number | null }
  }
}

type PackagesInquiryFormProps = {
  locale?: 'en' | 'es'
  draftToken: string
  draft: DraftPayload
}

const copy = {
  en: {
    title: 'Tell us how to reach you',
    subtitle: 'We’ll save your exact package estimate with this inquiry.',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    submit: 'SUBMIT INQUIRY',
    contactPreferences: 'Contact preferences',
    emailComms: 'Email me about my inquiry and event planning.',
    smsComms: 'Text me about my inquiry.',
    emailMarketing: 'Send me marketing emails.',
    smsMarketing: 'Send me promotional text messages.',
    optional: 'Optional',
    privacy: 'By submitting, you agree to our Privacy Policy and Terms.',
  },
  es: {
    title: 'Cuéntanos cómo contactarte',
    subtitle: 'Guardaremos tu estimado exacto con esta consulta.',
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'Correo',
    phone: 'Teléfono',
    submit: 'ENVIAR CONSULTA',
    contactPreferences: 'Preferencias de contacto',
    emailComms: 'Envíame correos sobre mi consulta y la planificación del evento.',
    smsComms: 'Envíame mensajes sobre mi consulta.',
    emailMarketing: 'Envíame correos promocionales.',
    smsMarketing: 'Envíame mensajes promocionales.',
    optional: 'Opcional',
    privacy: 'Al enviar, aceptas nuestra Política de privacidad y Términos.',
  },
} as const

function readConfiguratorInput(raw: unknown): PublicPackagesConfiguratorInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const guestCount = Number(value.guestCount)
  const rentalPeriod = value.rentalPeriod
  const packageTierId = value.packageTierId
  if (typeof value.eventDate !== 'string' || !Number.isInteger(guestCount)) return null
  if (rentalPeriod !== 'morning' && rentalPeriod !== 'evening' && rentalPeriod !== 'full_day') return null
  if (packageTierId !== 'essentials' && packageTierId !== 'signature' && packageTierId !== 'luxor') return null
  return {
    eventDate: value.eventDate,
    eventType: typeof value.eventType === 'string' ? value.eventType : null,
    guestCount,
    rentalPeriod,
    packageTierId,
    decorAddOnQuantities: typeof value.decorAddOnQuantities === 'object' && value.decorAddOnQuantities
      ? value.decorAddOnQuantities as Record<string, number>
      : {},
  }
}

export function PackagesInquiryForm({ locale = 'en', draftToken, draft }: PackagesInquiryFormProps) {
  const t = copy[locale]
  const router = useRouter()
  const preferencesId = useId()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailInquiryOptIn, setEmailInquiryOptIn] = useState(true)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [smsMarketingOptIn, setSmsMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startedAt] = useState(Date.now())

  const configuratorInput = readConfiguratorInput(draft.configuratorInput)
  const summaryLines = draft.quote?.summaryLines || draft.quote?.summary_lines || []
  const total = draft.quote?.totals?.totalEstimate ?? null

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (!digits) return ''
    if (digits.length <= 3) return `(${digits}`
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const response = await submitLuxorIdempotentForm('packages-inquiry', '/api/public/packages-inquiry/submit', {
        draftToken,
        firstName,
        lastName,
        email,
        phone,
        emailInquiryOptIn,
        smsOptIn,
        smsMarketingOptIn,
        marketingOptIn,
        formStartedAt: startedAt,
        sessionId: getLuxorPublicSessionId(),
        pagePath: typeof window === 'undefined' ? '/packages/inquiry' : window.location.pathname,
        locale,
      })
      const data = await response.json().catch(() => ({})) as { error?: string; inquiry?: { id: string } }
      if (!response.ok) throw new Error(data.error || 'Unable to submit your inquiry.')
      const inquiryId = data.inquiry?.id
      const confirmPath = locale === 'es' ? '/es/packages/confirmation' : '/packages/confirmation'
      router.push(inquiryId ? `${confirmPath}?inquiryId=${encodeURIComponent(inquiryId)}` : confirmPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit your inquiry.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (!configuratorInput) {
    return <p className="text-sm text-[#d7c29a]/80">Your configuration could not be loaded. Return to Packages and try again.</p>
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.95fr)]">
      <form onSubmit={handleSubmit} className="rounded-md border border-[#caa24c]/22 bg-[#fffdfa] p-6 text-[#241d17] sm:p-8">
        <h1 className="font-serif text-3xl text-[#241d17] sm:text-4xl">{t.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#665a4e]">{t.subtitle}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{t.firstName} *</span>
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="min-h-12 w-full rounded-md border border-[#d8c4a4] bg-white px-4 text-sm outline-none focus:border-[#b98a3d]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{t.lastName} *</span>
            <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="min-h-12 w-full rounded-md border border-[#d8c4a4] bg-white px-4 text-sm outline-none focus:border-[#b98a3d]" />
          </label>
          <label className="block sm:col-span-1">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{t.email} *</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-12 w-full rounded-md border border-[#d8c4a4] bg-white px-4 text-sm outline-none focus:border-[#b98a3d]" />
          </label>
          <label className="block sm:col-span-1">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{t.phone} *</span>
            <input required type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="min-h-12 w-full rounded-md border border-[#d8c4a4] bg-white px-4 text-sm outline-none focus:border-[#b98a3d]" />
          </label>
        </div>

        <section className="mt-8 space-y-4 border-t border-[#eadfcf] pt-6" aria-labelledby={`${preferencesId}-heading`}>
          <h2 id={`${preferencesId}-heading`} className="font-serif text-xl text-[#241d17]">{t.contactPreferences}</h2>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={emailInquiryOptIn} onChange={(e) => setEmailInquiryOptIn(e.target.checked)} className="mt-1 accent-[#caa24c]" />
            <span>{t.emailComms}</span>
          </label>
          <p className="ml-7 text-xs leading-5 text-[#827567]" lang="en">{LUXOR_INQUIRY_EMAIL_DISCLOSURE}</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mt-1 accent-[#caa24c]" />
            <span>{t.smsComms}</span>
          </label>
          <p className="ml-7 text-xs leading-5 text-[#827567]" lang="en">{LUXOR_INQUIRY_SMS_DISCLOSURE}</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-1 accent-[#caa24c]" />
            <span>{t.emailMarketing} <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8d672b]">{t.optional}</span></span>
          </label>
          <p className="ml-7 text-xs leading-5 text-[#827567]" lang="en">{LUXOR_MARKETING_EMAIL_DISCLOSURE}</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={smsMarketingOptIn} onChange={(e) => setSmsMarketingOptIn(e.target.checked)} className="mt-1 accent-[#caa24c]" />
            <span>{t.smsMarketing} <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8d672b]">{t.optional}</span></span>
          </label>
          <p className="ml-7 text-xs leading-5 text-[#827567]" lang="en">{LUXOR_MARKETING_SMS_DISCLOSURE}</p>
        </section>

        {error ? <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p> : null}
        <button type="submit" disabled={submitting} className="luxor-gold-raised mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> {t.submit}</> : <>{t.submit} <ArrowRight className="h-4 w-4" /></>}
        </button>
        <p className="mt-4 text-xs leading-5 text-[#827567]">
          {t.privacy.split(locale === 'es' ? 'Política de privacidad' : 'Privacy Policy')[0]}
          <Link href={locale === 'es' ? '/es/privacy' : '/privacy'} className="text-[#8d672b] underline">Privacy Policy</Link>
          {' / '}
          <Link href={locale === 'es' ? '/es/terms' : '/terms'} className="text-[#8d672b] underline">{locale === 'es' ? 'Términos' : 'Terms'}</Link>.
        </p>
      </form>

      <PackagesInquiryEventSummary
        locale={locale}
        input={configuratorInput}
        summaryLines={summaryLines}
        total={total}
      />
    </div>
  )
}
