'use client'

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, Mail, Phone } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { isGuestCountOverCapacity, LUXOR_EVENT_TYPES, LUXOR_GUEST_CAPACITY_MESSAGE } from '@/lib/luxorInquiryTypes'
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

const BUDGET_OPTIONS = [
  { value: 'Under $5,000', label: 'Under $5,000' },
  { value: '$5,000–$10,000', label: '$5,000–$10,000' },
  { value: '$10,000–$15,000', label: '$10,000–$15,000' },
  { value: '$15,000–$20,000', label: '$15,000–$20,000' },
  { value: '$20,000+', label: '$20,000+' },
  { value: 'Not sure yet', label: 'Not sure yet' },
]

const PUBLIC_SELECT_BUTTON_CLASS = '!h-12 !rounded-md !px-4 !py-0 !text-left !text-sm'
const PUBLIC_DATE_PICKER_CLASS = 'w-full [&>button]:h-12 [&>button]:rounded-md [&>button]:px-4 [&>button]:py-0'
const FORM_TRANSITION = { duration: 0.38, ease: [0.23, 1, 0.32, 1] as const }

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
  const [budget, setBudget] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsMarketingOptIn, setSmsMarketingOptIn] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [packageInterest, setPackageInterest] = useState(initialPackageInterest)
  const [preferredTourSlotId, setPreferredTourSlotId] = useState('')
  const [preferredTourDate, setPreferredTourDate] = useState('')
  const [preferredTourTime, setPreferredTourTime] = useState('')
  const [preferredTourWindow, setPreferredTourWindow] = useState('')
  const startedAt = useRef(Date.now())
  const trackedStart = useRef(false)
  const formBodyRef = useRef<HTMLDivElement>(null)
  const [formBodyHeight, setFormBodyHeight] = useState<number | null>(null)
  const { slots: tourSlots, loading: tourSlotsLoading, error: tourSlotsError } = useLuxorTourSlots()

  useLayoutEffect(() => {
    const body = formBodyRef.current
    if (!body) return

    const updateHeight = () => setFormBodyHeight(Math.ceil(body.getBoundingClientRect().height))
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

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

  function handleTourDateChange(date: string) {
    setPreferredTourDate(date)
    setPreferredTourSlotId('')
    setPreferredTourTime('')
  }

  function goToContactStep() {
    markStarted()
    if (!eventType) {
      setError('Please select the type of event you are planning.')
      return
    }
    if (isGuestCountOverCapacity(guestCount)) {
      setError(LUXOR_GUEST_CAPACITY_MESSAGE)
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

    if (isGuestCountOverCapacity(guestCount)) {
      setStep(1)
      setError(LUXOR_GUEST_CAPACITY_MESSAGE)
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
      smsMarketingOptIn: Boolean(cleanPhone && smsMarketingOptIn),
      marketingOptIn,
      eventType,
      targetDate,
      guestCount,
      budget,
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
  const tourDates = Array.from(new Map(tourSlots.map((slot) => [slot.date, slot.dateLabel])).entries())
  const selectedDateSlots = tourSlots.filter((slot) => slot.date === preferredTourDate)

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
        {!submitted ? <motion.span key={step} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={FORM_TRANSITION} className="shrink-0 text-xs font-semibold text-[#d7c29a]/70">Step {step} of 2</motion.span> : null}
      </div>

      <motion.div
        initial={false}
        animate={formBodyHeight === null ? undefined : { height: formBodyHeight }}
        transition={FORM_TRANSITION}
        className="overflow-hidden"
      >
        <div ref={formBodyRef}>
          {submitted ? (
            <motion.div key="submitted" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={FORM_TRANSITION} className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-6" role="status">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#caa24c] text-[#050505]"><Check className="h-6 w-6" /></div>
              <h3 className="mt-5 font-serif text-3xl text-[#f7efe3]">{reservedTour ? 'Your tour request is received.' : 'We received your event details.'}</h3>
              <p className="mt-3 text-sm leading-6 text-[#d7c29a]/78">
                {reservedTour
                  ? 'Thanks for your request! We have received your requested date and time. Our team will send an official confirmation email once accepted, or contact you if we need to adjust timing.'
                  : 'A Luxor coordinator will review your request and contact you within one business day with availability and next steps.'}
              </p>
            </motion.div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
          {step === 1 ? (
            <motion.div key="event-details" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={FORM_TRANSITION}>
              <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
                <FieldLabel label="Event type" required>
                  <PortalSelect value={eventType} onChange={setEventType} className="w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder="Select event type" options={LUXOR_EVENT_TYPES.map((type) => ({ value: type, label: type }))} />
                </FieldLabel>
                <FieldLabel label="Target event date">
                  <PortalDatePicker theme="light" value={targetDate} onChange={setTargetDate} className={PUBLIC_DATE_PICKER_CLASS} placeholder="Select date" />
                </FieldLabel>
                <div>
                  <TextField value={guestCount} onChange={setGuestCount} name="guestCount" label="Expected guests" placeholder="For example, 120" inputMode="numeric" />
                  {isGuestCountOverCapacity(guestCount) ? <p role="alert" className="mt-2 text-xs leading-5 text-[#f1d27a]">{LUXOR_GUEST_CAPACITY_MESSAGE}</p> : null}
                </div>
                <FieldLabel label="Planning budget">
                  <PortalSelect value={budget} onChange={setBudget} className="w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder="Choose a range" options={BUDGET_OPTIONS} />
                </FieldLabel>
                <FieldLabel label="Which package fits best?">
                  <PortalSelect value={packageInterest} onChange={setPackageInterest} className="w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder="Choose a package" options={LUXOR_PACKAGE_INTEREST_OPTIONS} />
                </FieldLabel>
              </div>

              {showTourFields ? (
                <div className="mt-5 rounded-lg border border-[#caa24c]/18 bg-white/[0.025] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">Tour availability</p>
                  <p className="mt-2 text-xs leading-5 text-[#d7c29a]/68">Tours are 30 minutes Monday through Friday. One party per time; booking closes 24 hours before the tour.</p>
                  {tourSlotsLoading ? <p className="mt-3 text-sm text-[#d7c29a]/70">Loading current openings…</p> : null}
                  {tourSlotsError ? <p className="mt-3 text-sm text-red-200">{tourSlotsError}</p> : null}
                  {!tourSlotsLoading && tourSlots.length > 0 ? (
                    <div className="mt-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <PortalSelect value={preferredTourDate} onChange={handleTourDateChange} className="w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder="Choose a date" options={tourDates.map(([value, label]) => ({ value, label }))} />
                        <PortalSelect value={preferredTourSlotId} onChange={handleTourSlotChange} className="w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder={preferredTourDate ? 'Choose a time' : 'Choose a date first'} options={selectedDateSlots.map((slot) => ({ value: slot.id, label: slot.time }))} disabled={!preferredTourDate} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#d7c29a]/62">Complete the next step to reserve your selected time immediately.</p>
                    </div>
                  ) : !tourSlotsLoading ? (
                    <div className="mt-3">
                      <p className="text-sm leading-6 text-[#d7c29a]/72">No published times are open right now. Choose the window that works best and the team will respond with options.</p>
                      <PortalSelect value={preferredTourWindow} onChange={setPreferredTourWindow} className="mt-3 w-full" buttonClassName={PUBLIC_SELECT_BUTTON_CLASS} placeholder="Preferred tour window" options={TOUR_WINDOWS} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <ErrorMessage message={error} /> : null}
              <button type="button" onClick={goToContactStep} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#050505] transition hover:bg-[#dfbd68] sm:w-auto">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="contact-details" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={FORM_TRANSITION}>
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
                <>
                  <SmsConsentRow checked={smsOptIn} onChange={setSmsOptIn} />
                  <SmsMarketingConsentRow checked={smsMarketingOptIn} onChange={setSmsMarketingOptIn} />
                </>
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
            </motion.div>
          )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </form>
  )
}

function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="flex h-full min-w-0 flex-col"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">{label}{required ? ' *' : ''}</span>{children}</div>
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
    <label className="flex h-full min-w-0 flex-col">
      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">{label}{required ? ' *' : ''}</span>
      <span className="relative mt-2 block">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#caa24c]">{icon}</span> : null}
        <input name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} inputMode={inputMode} autoComplete={autoComplete} placeholder={placeholder} className={`h-12 w-full rounded-md border border-[#caa24c]/24 bg-black/35 px-4 py-0 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/42 focus:border-[#f1d27a]/70 ${icon ? 'pl-10' : ''}`} />
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

function SmsConsentRow({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#caa24c]"
        />
        <span className="text-xs leading-5 text-[#d7c29a]/72">
          By checking this box, I agree to receive customer-care text messages from Luxor Event Space about my inquiry, tour, booking, payment, or event. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.
        </span>
      </label>
      <p className="ml-7 mt-2 text-xs leading-5 text-[#d7c29a]/58">
        Read the <a href="/privacy" className="text-[#f1d27a] underline underline-offset-4">Privacy Policy</a> and <a href="/terms" className="text-[#f1d27a] underline underline-offset-4">Terms</a>.
      </p>
    </div>
  )
}

function SmsMarketingConsentRow({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="mt-3 rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#caa24c]" />
        <span className="text-xs leading-5 text-[#d7c29a]/72">
          I agree to receive occasional promotional text messages from Luxor Event Space, such as venue open-house invitations and planning offers. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.
        </span>
      </label>
      <p className="ml-7 mt-2 text-xs leading-5 text-[#d7c29a]/58">This optional marketing consent is separate from customer-care messages. Read the <a href="/privacy" className="text-[#f1d27a] underline underline-offset-4">Privacy Policy</a> and <a href="/terms" className="text-[#f1d27a] underline underline-offset-4">Terms</a>.</p>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return <p role="alert" aria-live="polite" className="mt-4 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">{message}</p>
}
