'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Check, Download, FileText, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import Link from 'next/link'

const EVENT_TYPE_OPTIONS = [
  { value: 'Wedding', label: 'Wedding' },
  { value: 'Quinceañera', label: 'Quinceañera' },
  { value: 'Birthday', label: 'Birthday / Milestone Celebration' },
  { value: 'Corporate', label: 'Corporate Event' },
  { value: 'Other', label: 'Other Special Event' },
]

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function LuxorBrochureForm({ className = '' }: { className?: string }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventType, setEventType] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formSectionRef = useRef<HTMLDivElement>(null)
  const formViewTrackedRef = useRef(false)

  useEffect(() => {
    const element = formSectionRef.current
    if (!element || formViewTrackedRef.current) return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || formViewTrackedRef.current) return
      formViewTrackedRef.current = true
      observer.disconnect()
      void import('@/lib/luxorPublicAttribution')
        .then(({ trackLuxorPublicEvent }) => trackLuxorPublicEvent('brochure_form_view', { source: 'homepage_brochure' }))
        .catch(() => {})
    }, { threshold: 0.35 })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Please enter a valid email address to receive your brochure.')
      return
    }

    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }

    if (!eventType) {
      setError('Please select an event type.')
      return
    }

    if (!marketingConsent) {
      setError('Please agree to receive communications regarding your brochure and inquiry.')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        eventType,
        targetDate: eventDate || null,
        message: 'Requested venue brochure via homepage',
        source: 'homepage_brochure',
        flow: 'brochure_lead',
        marketingOptIn: true,
        pagePath: typeof window === 'undefined' ? '/' : window.location.pathname,
        metadata: {
          leadSource: 'Homepage Brochure Form',
          marketingConsentAgreed: true,
          brochureRequestedAt: new Date().toISOString(),
        },
      }

      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit your brochure request. Please try again.')
      }

      setSubmitted(true)

      try {
        const { trackLuxorPublicEvent } = await import('@/lib/luxorPublicAttribution')
        trackLuxorPublicEvent('brochure_submitted', {
          event_type: eventType,
          lead_source: 'Homepage Brochure Form',
          has_date: Boolean(eventDate),
        })
      } catch {
        // Non-blocking
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDownloadClick() {
    try {
      import('@/lib/luxorPublicAttribution').then(({ trackLuxorPublicEvent }) => {
        trackLuxorPublicEvent('brochure_downloaded', {
          source: 'homepage_confirmation',
        })
      })
    } catch {
      // Non-blocking
    }
  }

  return (
    <div
      ref={formSectionRef}
      id="brochure-form"
      className={`scroll-mt-28 rounded-3xl border border-[#d8c4a4] bg-[#fffdfa] p-6 text-[#241d17] shadow-[0_28px_70px_-42px_rgba(78,54,23,0.38)] sm:p-10 lg:p-12 ${className}`}
    >
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="brochure-confirmation"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="text-center py-6 sm:py-8"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#caa24c] bg-[#fbf3e4] text-[#8d672b]">
              <Check className="h-8 w-8 stroke-[2.5]" />
            </div>

            <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#caa24c]">
              Brochure Request Received
            </p>

            <h3 className="mt-2 font-serif text-3xl text-[#241d17] sm:text-4xl">
              Thank You for Your Interest in Luxor Events!
            </h3>

            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-[#665a4e] sm:text-base">
              Thank you for your interest in Luxor at Las Palmas Events. Please check your inbox at{' '}
              <strong className="font-semibold text-[#6f4d1f]">{email}</strong> for your free venue brochure. If you do not see it, please check your spam or promotions folder. You can also download it immediately below.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/api/brochure/download"
                download="Luxor-at-Las-Palmas-Venue-Brochure.pdf"
                onClick={handleDownloadClick}
                data-conversion="brochure_download_click"
                className="inline-flex min-h-14 w-full sm:w-auto items-center justify-center gap-3 rounded-xl border border-[#f1d27a]/50 bg-[#caa24c] px-8 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-[0_18px_40px_-18px_rgba(202,162,76,0.8)] transition hover:bg-[#dfbd68] hover:shadow-[0_22px_50px_-18px_rgba(202,162,76,1)]"
              >
                <Download className="h-4 w-4 text-[#050505]" />
                <span>Download Your Free Brochure</span>
              </a>

              <Link
                href="/visit"
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#d8c4a4] bg-white px-7 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#6f4d1f] transition hover:border-[#b98a3d] hover:bg-[#fbf3e4] sm:w-auto"
              >
                <span>Schedule a Visit →</span>
              </Link>
            </div>

            <p className="mt-6 text-xs text-[#827567]">
              Have immediate questions or want to check date availability? Call us at{' '}
              <a href="tel:+12109068803" className="text-[#8d672b] underline hover:text-[#6f4d1f]">
                (210) 906-8803
              </a>
              .
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="brochure-form-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header & feature bullets */}
            <div className="max-w-2xl">
              <h2 className="font-serif text-3xl leading-[1.02] text-[#241d17] sm:text-4xl lg:text-5xl">
                Get Your Free Venue Brochure
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-[#665a4e] sm:text-base">
                Explore full details on hosting your celebration at Luxor at Las Palmas. Our brochure includes everything you need:
              </p>

              {/* What's included checklist */}
              <div className="mt-5 grid gap-2.5 text-xs text-[#4f4032] sm:grid-cols-2 sm:text-sm">
                {[
                  'Venue photos & floor plans',
                  'Included amenities',
                  'Bar & catering flexibility',
                  'Planning and booking information',
                  'Next steps for your event',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5ead8] text-[#8d672b]">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form inputs */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Full Name */}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#caa24c]">
                    Full Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="First and last name"
                    className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-white px-4 text-sm text-[#241d17] outline-none transition placeholder:text-[#827567] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#caa24c]/20"
                  />
                </label>

                {/* Email Address */}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#caa24c]">
                    Email Address *
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-white px-4 text-sm text-[#241d17] outline-none transition placeholder:text-[#827567] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#caa24c]/20"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Phone Number */}
                <label className="block sm:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#caa24c]">
                    Phone Number *
                  </span>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    placeholder="(210) 555-5555"
                    className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-white px-4 text-sm text-[#241d17] outline-none transition placeholder:text-[#827567] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#caa24c]/20"
                  />
                </label>

                {/* Event Type (Required) */}
                <div className="block sm:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#caa24c]">
                    Event Type *
                  </span>
                  <PortalSelect
                    theme="light"
                    value={eventType}
                    onChange={setEventType}
                    options={EVENT_TYPE_OPTIONS}
                    placeholder="Select event type"
                    className="w-full"
                    buttonClassName="min-h-12 rounded-xl border-[#d8c4a4] bg-white px-4 text-sm normal-case tracking-normal text-[#241d17] hover:border-[#b98a3d]"
                  />
                </div>

                {/* Estimated Event Date (Optional - only optional field) */}
                <div className="block sm:col-span-1">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#caa24c]">
                    Estimated Event Date <span className="text-[#a0907e] font-normal lowercase">(optional)</span>
                  </span>
                  <PortalDatePicker
                    theme="light"
                    value={eventDate}
                    onChange={setEventDate}
                    minDate={new Date().toISOString().slice(0, 10)}
                    placeholder="Select date (if known)"
                    className="w-full [&>button]:min-h-12 [&>button]:rounded-xl [&>button]:border-[#d8c4a4] [&>button]:bg-white [&>button]:px-4 [&>button]:text-sm [&>button]:normal-case [&>button]:tracking-normal [&>button]:text-[#241d17] hover:[&>button]:border-[#b98a3d]"
                  />
                </div>
              </div>

              {/* Marketing Consent Checkbox (Required) */}
              <div className="pt-2">
                <label className="flex cursor-pointer select-none items-start gap-3 text-xs leading-relaxed text-[#665a4e]">
                  <input
                    type="checkbox"
                    required
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="luxor-public-checkbox mt-1 h-4 w-4 shrink-0 rounded border-2 border-[#caa24c]"
                  />
                  <span>
                    I agree to receive email and SMS communications from Luxor at Las Palmas Events regarding my inquiry, venue updates, promotions, and booking information. Message & data rates may apply. Reply STOP to unsubscribe.
                  </span>
                </label>
              </div>

              {/* Error Alert */}
              {error && (
                <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-200">
                  {error}
                </div>
              )}

              {/* Submit CTA */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-[#f1d27a]/50 bg-[#caa24c] px-8 py-4 font-serif text-sm font-bold uppercase tracking-[0.18em] text-[#050505] shadow-[0_18px_40px_-18px_rgba(202,162,76,0.8)] transition hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending Brochure...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="hidden h-4 w-4 text-[#050505] sm:block" />
                      <span>Get Your Free Venue Brochure</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
