'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, CalendarDays, Check, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { LUXOR_EVENT_TYPES, LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { PortalSelect } from '@/components/portal/PortalUI'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'

type LuxorInquiryFormProps = {
  source: string
  flow?: string
  title?: string
  submitLabel?: string
  showTourFields?: boolean
  compact?: boolean
  onSubmitted?: () => void
}

export function LuxorInquiryForm({
  source,
  flow = 'tour_request',
  title = 'Tell us about your event.',
  submitLabel = 'Request a tour',
  showTourFields = false,
  compact = false,
  onSubmitted,
}: LuxorInquiryFormProps) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [eventType, setEventType] = useState('')
  const [preferredTourSlotId, setPreferredTourSlotId] = useState('')
  const [preferredTourDate, setPreferredTourDate] = useState('')
  const [preferredTourTime, setPreferredTourTime] = useState('')
  const { slots: tourSlots, loading: tourSlotsLoading, error: tourSlotsError } = useLuxorTourSlots()

  function handleTourSlotChange(slotId: string) {
    const selectedSlot = tourSlots.find((slot) => slot.id === slotId)

    setPreferredTourSlotId(slotId)
    setPreferredTourDate(selectedSlot?.date ?? '')
    setPreferredTourTime(selectedSlot?.time ?? '')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const payload: LuxorInquiryInput = {
      fullName: String(form.get('fullName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      eventType: eventType,
      targetDate: String(form.get('targetDate') ?? ''),
      guestCount: String(form.get('guestCount') ?? ''),
      preferredTourDate: preferredTourDate,
      preferredTourTime: preferredTourTime,
      packageInterest: String(form.get('packageInterest') ?? ''),
      message: String(form.get('message') ?? ''),
      source,
      flow,
      pagePath: window.location.pathname,
      referrer: document.referrer,
      metadata: preferredTourSlotId ? { selectedTourSlotId: preferredTourSlotId } : undefined,
    }

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? 'The request could not be submitted.')
      }

      setSubmitted(true)
      onSubmitted?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-md border border-[#caa24c]/22 bg-[#080706] shadow-[0_34px_90px_-58px_rgba(0,0,0,0.95)] ${compact ? 'p-5' : 'p-5 sm:p-8'}`}
    >
      <div className="mb-6 border-b border-[#caa24c]/20 pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Tour request</p>
          <h2 className="mt-2 font-serif text-3xl leading-none text-[#f7efe3]">{title}</h2>
        </div>
      </div>

      {submitted ? (
        <div className="rounded-md border border-[#caa24c]/25 bg-black/25 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#caa24c] text-[#050505]">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="mt-5 font-serif text-3xl text-[#f7efe3]">Request received.</h3>
          <p className="mt-3 text-sm leading-6 text-[#d7c29a]/72">
            Your details were sent to the Luxor CRM. A coordinator can now follow up with availability and next steps.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col justify-end">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c] mb-2">Event type</span>
              <PortalSelect
                value={eventType}
                onChange={setEventType}
                className="w-full text-left"
                placeholder="Select event type"
                options={LUXOR_EVENT_TYPES.map(t => ({ value: t, label: t }))}
              />
            </div>

            <TextField name="targetDate" label="Target date" placeholder="Month or date" />
            <TextField name="guestCount" label="Guest count" placeholder="Estimated count" inputMode="numeric" />
            <TextField name="fullName" label="Full name" placeholder="Your name" required />
            <TextField name="email" label="Email" placeholder="you@example.com" type="email" />
            <TextField name="phone" label="Phone" placeholder="(210) 000-0000" type="tel" />

            {showTourFields && (
              <div className="sm:col-span-2">
                <div className="flex flex-col justify-end">
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c] mb-2">Available tour slot</span>
                  <PortalSelect
                    value={preferredTourSlotId}
                    onChange={handleTourSlotChange}
                    className="w-full text-left font-mono"
                    placeholder={tourSlotsLoading ? 'Loading availability...' : 'Select an open tour slot'}
                    disabled={tourSlotsLoading || tourSlots.length === 0}
                    options={tourSlots.map((slot) => ({ value: slot.id, label: slot.label }))}
                  />
                </div>
                {tourSlotsError ? (
                  <p className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
                    {tourSlotsError}
                  </p>
                ) : !tourSlotsLoading && tourSlots.length === 0 ? (
                  <p className="mt-2 rounded-md border border-[#caa24c]/18 bg-black/25 px-3 py-2 text-xs leading-5 text-[#d7c29a]/70">
                    No open tour slots are published right now. Please send your event details and Luxor can follow up with options.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <label className="mt-5 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">Package interest</span>
            <input
              name="packageInterest"
              type="text"
              placeholder="Foundation, Signature, Showpiece, or not sure"
              className="mt-2 w-full rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/35 focus:border-[#f1d27a]/70"
            />
          </label>

          <label className="mt-5 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">Notes</span>
            <textarea
              name="message"
              placeholder="Tell us what kind of event you are imagining..."
              className="mt-2 h-28 w-full resize-none rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-4 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/35 focus:border-[#f1d27a]/70"
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">{error}</p>
          ) : null}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-2xl disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : showTourFields ? <CalendarDays className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {submitting ? 'Sending' : submitLabel}
          </motion.button>
        </>
      )}
    </form>
  )
}

function TextField({
  name,
  label,
  placeholder,
  type = 'text',
  required = false,
  inputMode,
}: {
  name: string
  label: string
  placeholder?: string
  type?: string
  required?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">{label}</span>
      <input
        name={name}
        required={required}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/35 focus:border-[#f1d27a]/70"
      />
    </label>
  )
}
