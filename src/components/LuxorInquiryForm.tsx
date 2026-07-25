'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, Mail, Phone } from 'lucide-react'
import { motion } from 'framer-motion'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { LUXOR_EVENT_TYPES } from '@/lib/luxorInquiryTypes'
import { getLuxorPublicAttribution, getLuxorPublicSessionId, trackLuxorPublicEvent } from '@/lib/luxorPublicAttribution'
import { LUXOR_LEGACY_PACKAGE_NAMES, LUXOR_PACKAGE_INTEREST_OPTIONS } from '@/lib/luxorServiceCatalog'

type LuxorInquiryFormProps = {
  source: string
  flow?: string
  title?: string
  submitLabel?: string
  showTourFields?: boolean
  compact?: boolean
  initialPackageInterest?: string
  onSubmitted?: () => void
}

const TOUR_WINDOWS = [
  { value: 'Weekday morning', label: 'Weekday morning' },
  { value: 'Weekday afternoon', label: 'Weekday afternoon' },
  { value: 'Weekday evening', label: 'Weekday evening' },
  { value: 'Weekend', label: 'Weekend' },
  { value: 'Flexible', label: 'I am flexible' },
]

export function LuxorInquiryForm({
  source,
  flow = 'tour_request',
  title = 'Tell us about your event.',
  submitLabel = 'Send inquiry',
  showTourFields = false,
  compact = false,
  initialPackageInterest = '',
  onSubmitted,
}: LuxorInquiryFormProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventType, setEventType] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [packageInterest, setPackageInterest] = useState(initialPackageInterest)
  const [preferredTourSlotId, setPreferredTourSlotId] = useState('')
  const [preferredTourDate, setPreferredTourDate] = useState('')
  const [preferredTourTime, setPreferredTourTime] = useState('')
  const [preferredTourWindow, setPreferredTourWindow] = useState('')
  const startedAt = useRef(Date.now())
  const trackedStart = useRef(false)
  const { slots: tourSlots, loading: tourSlotsLoading, error: tourSlotsError } = useLuxorTourSlots()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedPackage = params.get('package')
    const requestedEvent = params.get('event')
    const normalizedPackage = requestedPackage ? (LUXOR_LEGACY_PACKAGE_NAMES[requestedPackage] || requestedPackage) : ''
    if (normalizedPackage && LUXOR_PACKAGE_INTEREST_OPTIONS.some((option) => option.value === normalizedPackage)) setPackageInterest(normalizedPackage)
    if (requestedEvent && LUXOR_EVENT_TYPES.includes(requestedEvent as (typeof LUXOR_EVENT_TYPES)[number])) setEventType(requestedEvent)
  }, [])

  useEffect(() => {
    if (initialPackageInterest && LUXOR_PACKAGE_INTEREST_OPTIONS.some((option) => option.value === initialPackageInterest)) {
      setPackageInterest(initialPackageInterest)
    }
  }, [initialPackageInterest])

  function markStarted() {
    if (trackedStart.current) return
    trackedStart.current = true
    trackLuxorPublicEvent('form_started', { source, flow })
  }

  function handleTourSlotChange(slotId: string) {
    const selectedSlot = tourSlots.find((slot) => slot.id === slotId)
    setPreferredTourSlotId(slotId)
    setPreferredTourDate(selectedSlot?.date ?? '')
    setPreferredTourTime(selectedSlot?.time ?? '')
  }

  function goToContactStep() {
    markStarted()
    if (!eventType) {
      setError('Please select the type of event you are planning.')
      return
    }
    setError(null)
    setStep(2)
    trackLuxorPublicEvent('form_step_completed', { source, flow, step: 'event_details', eventType, packageInterest })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    markStarted()
    setError(null)

    const form = new FormData(event.currentTarget)
    const cleanEmail = email.trim()
    const cleanPhone = phone.trim()

    if (!eventType) {
      setStep(1)
      setError('Please select the type of event you are planning.')
      return
    }

    if (!fullName.trim()) {
      setError('Please add your full name.')
      return
    }

    if (!cleanEmail && !cleanPhone) {
      setError('Please add either an email address or phone number so Luxor can follow up.')
      return
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please check the email address and try again.')
      return
    }

    if (cleanPhone && cleanPhone.replace(/\D/g, '').length < 10) {
      setError('Please enter a complete phone number.')
      return
    }

    setSubmitting(true)

    const payload: LuxorInquiryInput = {
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      smsOptIn: Boolean(cleanPhone && smsOptIn),
      marketingOptIn,
      eventType,
      targetDate,
      guestCount,
      preferredTourDate,
      preferredTourTime,
      packageInterest,
      message: String(form.get('message') ?? ''),
      source,
      flow,
      pagePath: window.location.pathname,
      referrer: document.referrer,
      website: String(form.get('website') ?? ''),
      formStartedAt: startedAt.current,
      sessionId: getLuxorPublicSessionId(),
      attribution: getLuxorPublicAttribution(),
      metadata: {
        selectedTourSlotId: preferredTourSlotId || null,
        preferredTourWindow: preferredTourWindow || null,
        contactPreference: cleanPhone && smsOptIn ? 'text_or_email' : cleanEmail ? 'email' : 'phone',
      },
    }

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'The request could not be submitted.')

      setSubmitted(true)
      onSubmitted?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  const reservedTour = Boolean(preferredTourSlotId)

  return (
    <form
      onSubmit={handleSubmit}
      onFocusCapture={markStarted}
      className={`rounded-lg border border-[#caa24c]/24 bg-[#080706] shadow-[0_34px_90px_-58px_rgba(0,0,0,0.95)] ${compact ? 'p-5' : 'p-5 sm:p-8'}`}
    >
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="mb-6 flex items-start justify-between gap-4 border-b border-[#caa24c]/20 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7b964]">{showTourFields ? 'Private tour' : 'Event inquiry'}</p>
          <h2 className="mt-2 font-serif text-3xl leading-none text-[#f7efe3]">{title}</h2>
        </div>
        {!submitted ? <span className="shrink-0 text-xs font-semibold text-[#d7c29a]/70">Step {step} of 2</span> : null}
      </div>

      {submitted ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-6" role="status">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#caa24c] text-[#050505]"><Check className="h-6 w-6" /></div>
          <h3 className="mt-5 font-serif text-3xl text-[#f7efe3]">{reservedTour ? 'Your tour time is reserved.' : 'We received your event details.'}</h3>
          <p className="mt-3 text-sm leading-6 text-[#d7c29a]/78">
            {reservedTour
              ? 'A confirmation is on its way. A Luxor coordinator will review the details and contact you if anything needs clarification.'
              : 'A Luxor coordinator will review your request and contact you within one business day with availability and next steps.'}
          </p>
        </div>
      ) : (
        <>
          {step === 1 ? (
            <div className="animate-in fade-in duration-300">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Event type" required>
                  <PortalSelect value={eventType} onChange={setEventType} className="w-full" buttonClassName="w-full text-left" placeholder="Select event type" options={LUXOR_EVENT_TYPES.map((type) => ({ value: type, label: type }))} />
                </FieldLabel>
                <FieldLabel label="Target event date">
                  <PortalDatePicker value={targetDate} onChange={setTargetDate} className="w-full" placeholder="Select date" />
                </FieldLabel>
                <TextField value={guestCount} onChange={setGuestCount} name="guestCount" label="Estimated guests" placeholder="For example, 120" inputMode="numeric" />
                <FieldLabel label="Which package fits best?">
                  <PortalSelect value={packageInterest} onChange={setPackageInterest} className="w-full" buttonClassName="w-full text-left" placeholder="Choose a package or get guidance" options={LUXOR_PACKAGE_INTEREST_OPTIONS} />
                </FieldLabel>
              </div>

              {showTourFields ? (
                <div className="mt-5 rounded-lg border border-[#caa24c]/18 bg-white/[0.025] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">Tour availability</p>
                  {tourSlotsLoading ? <p className="mt-3 text-sm text-[#d7c29a]/70">Loading current openings…</p> : null}
                  {tourSlotsError ? <p className="mt-3 text-sm text-red-200">{tourSlotsError}</p> : null}
                  {!tourSlotsLoading && tourSlots.length > 0 ? (
                    <div className="mt-3">
                      <PortalSelect value={preferredTourSlotId} onChange={handleTourSlotChange} className="w-full" buttonClassName="w-full text-left" placeholder="Choose an available tour" options={tourSlots.map((slot) => ({ value: slot.id, label: `${slot.label} · ${slot.availableSpots} open` }))} />
                      <p className="mt-2 text-xs leading-5 text-[#d7c29a]/62">Choosing a published time reserves it when you submit the next step.</p>
                    </div>
                  ) : !tourSlotsLoading ? (
                    <div className="mt-3">
                      <p className="text-sm leading-6 text-[#d7c29a]/72">No published times are open right now. Choose the window that works best and the team will respond with options.</p>
                      <PortalSelect value={preferredTourWindow} onChange={setPreferredTourWindow} className="mt-3 w-full" buttonClassName="w-full text-left" placeholder="Preferred tour window" options={TOUR_WINDOWS} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <ErrorMessage message={error} /> : null}
              <button type="button" onClick={goToContactStep} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#050505] transition hover:bg-[#dfbd68] sm:w-auto">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-[#d7c29a]/72">
                <span className="rounded-full border border-[#caa24c]/22 px-3 py-1.5">{eventType}</span>
                {targetDate ? <span className="rounded-full border border-[#caa24c]/22 px-3 py-1.5">{targetDate}</span> : null}
                {packageInterest ? <span className="rounded-full border border-[#caa24c]/22 px-3 py-1.5">{packageInterest}</span> : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField value={fullName} onChange={setFullName} name="fullName" label="Full name" placeholder="Your full name" required autoComplete="name" />
                <TextField value={email} onChange={setEmail} name="email" label="Email" placeholder="you@example.com" type="email" inputMode="email" autoComplete="email" icon={<Mail className="h-4 w-4" />} />
                <TextField value={phone} onChange={setPhone} name="phone" label="Phone" placeholder="(210) 000-0000" type="tel" inputMode="tel" autoComplete="tel" icon={<Phone className="h-4 w-4" />} />
                <div className="rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4 text-sm leading-6 text-[#d7c29a]/70">
                  Add an email, phone number, or both. We only need one way to respond.
                </div>
              </div>

              {phone.trim() ? (
                <ConsentRow checked={smsOptIn} onChange={setSmsOptIn}>
                  Text me about this inquiry, tour, booking, payment, or event. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. This is optional.
                </ConsentRow>
              ) : null}

              <ConsentRow checked={marketingOptIn} onChange={setMarketingOptIn}>
                Email me occasional Luxor news, open-house invitations, and planning ideas. This is optional and separate from my inquiry.
              </ConsentRow>

              <label className="mt-5 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">Anything we should know?</span>
                <textarea name="message" maxLength={3000} placeholder="Important moments, preferred layout, vendors, or questions…" className="mt-2 h-28 w-full resize-none rounded-md border border-[#caa24c]/24 bg-black/35 px-4 py-4 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/42 focus:border-[#f1d27a]/70" />
              </label>

              <p className="mt-4 text-xs leading-5 text-[#d7c29a]/58">By submitting, you agree that Luxor may respond to this request. Read our <a href="/privacy" className="text-[#f1d27a] underline underline-offset-4">Privacy Policy</a> and <a href="/terms" className="text-[#f1d27a] underline underline-offset-4">Terms</a>.</p>
              {error ? <ErrorMessage message={error} /> : null}

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => { setError(null); setStep(1) }} className="inline-flex items-center justify-center gap-2 rounded-md border border-[#caa24c]/28 px-5 py-3 text-sm font-semibold text-[#eadcc8] hover:border-[#f1d27a]/50">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <motion.button whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }} type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-3 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#050505] disabled:cursor-not-allowed disabled:opacity-70">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : reservedTour ? <CalendarDays className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  {submitting ? 'Sending…' : reservedTour ? 'Reserve this tour' : submitLabel}
                </motion.button>
              </div>
            </div>
          )}
        </>
      )}
    </form>
  )
}

function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">{label}{required ? ' *' : ''}</span>{children}</div>
}

function TextField({ value, onChange, name, label, placeholder, type = 'text', required, inputMode, autoComplete, icon }: {
  value: string
  onChange: (value: string) => void
  name: string
  label: string
  placeholder?: string
  type?: string
  required?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  icon?: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">{label}{required ? ' *' : ''}</span>
      <span className="relative mt-2 block">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#caa24c]">{icon}</span> : null}
        <input name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} inputMode={inputMode} autoComplete={autoComplete} placeholder={placeholder} className={`w-full rounded-md border border-[#caa24c]/24 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/42 focus:border-[#f1d27a]/70 ${icon ? 'pl-10' : ''}`} />
      </span>
    </label>
  )
}

function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#caa24c]" />
      <span className="text-xs leading-5 text-[#d7c29a]/72">{children}</span>
    </label>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return <p role="alert" aria-live="polite" className="mt-4 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">{message}</p>
}
