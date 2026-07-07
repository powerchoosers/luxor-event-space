'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Gift, Loader2, Mail, Music2, Sparkles, Utensils } from 'lucide-react'
import { motion } from 'framer-motion'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { PortalSelect } from '@/components/portal/PortalUI'
import { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

const showcaseDetails = [
  { label: 'Free tastings', icon: Utensils },
  { label: 'Vendor showcase', icon: Sparkles },
  { label: 'Giveaways', icon: Gift },
  { label: 'Live music', icon: Music2 },
]

const eventInterests = [
  'Wedding',
  'Quinceañera',
  'Baby shower',
  'Birthday',
  'Corporate event',
  'Private celebration',
  'Vendor partnership',
  'Other',
]

export default function GrandOpeningPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventInterest, setEventInterest] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(true)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('firstName') ?? '').trim()
    const lastName = String(form.get('lastName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const attendeeCount = String(form.get('attendeeCount') ?? '').trim()
    const willAttend = form.get('willAttend') === 'on'

    if (!willAttend) {
      setSubmitting(false)
      setError('Please confirm that you will attend the Grand Opening event.')
      return
    }

    const payload: LuxorInquiryInput = {
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      email,
      eventType: eventInterest || 'Grand Opening RSVP',
      targetDate: 'Saturday, July 25',
      guestCount: attendeeCount,
      attendeeCount,
      packageInterest: eventInterest,
      message: `Grand Opening RSVP${eventInterest ? ` - interested in ${eventInterest}` : ''}.`,
      source: 'grand_opening_rsvp',
      flow: 'grand_opening_rsvp',
      campaignKey: 'grand_opening_2026_07_25',
      rsvpStatus: 'attending',
      marketingOptIn,
      pagePath: window.location.pathname,
      referrer: document.referrer,
      metadata: {
        campaignName: 'Luxor Grand Opening Showcase',
        eventDateLabel: 'Saturday, July 25',
        eventInterest,
        formVersion: 'grand-opening-rsvp-v1',
      },
    }

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? 'The RSVP could not be submitted.')
      }

      setSubmitted(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The RSVP could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="overflow-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate min-h-screen overflow-hidden pt-32">
        <div className="absolute inset-0 luxor-noise opacity-20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(241,210,122,0.2),transparent_26rem),radial-gradient(circle_at_10%_35%,rgba(202,162,76,0.13),transparent_22rem),linear-gradient(180deg,#050505_0%,#0b0908_52%,#050505_100%)]" />
        <div className="absolute inset-x-0 top-28 h-px bg-gradient-to-r from-transparent via-[#caa24c]/55 to-transparent" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-8rem)] max-w-7xl gap-10 px-5 pb-20 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8">
          <div className="mx-auto w-full max-w-xl text-center">
            <LuxorAxisLockup className="mx-auto w-full max-w-[360px] sm:max-w-[460px]" dividerClassName="text-[#8e6829]" />
            <h1 className="mx-auto mt-8 max-w-[22rem] font-serif text-6xl leading-[0.86] text-[#f7efe3] sm:max-w-4xl sm:text-7xl lg:text-8xl">
              Grand Opening RSVP
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#d7c29a]/78">
              Join us for the Luxor Grand Opening Showcase on Saturday, July 25. Come tour the venue, meet vendors, enjoy tastings, and celebrate what is next for Luxor at Las Palmas.
            </p>

            <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {showcaseDetails.map(({ label, icon: Icon }) => (
                <div key={label} className="rounded-md border border-[#caa24c]/20 bg-black/28 px-3 py-4 text-center">
                  <Icon className="mx-auto h-5 w-5 text-[#f1d27a]" />
                  <p className="mt-3 font-mono text-[9px] font-bold uppercase leading-4 tracking-[0.18em] text-[#d7c29a]/74">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="#rsvp-form"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-[0_22px_44px_-26px_rgba(202,162,76,0.8)]"
              >
                RSVP now <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/visit"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#caa24c]/35 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3] transition hover:border-[#f1d27a]/60"
              >
                Schedule a tour instead
              </Link>
            </div>
          </div>

          <div id="rsvp-form" className="scroll-mt-32">
            <form onSubmit={handleSubmit} className="relative overflow-hidden rounded-md border border-[#caa24c]/25 bg-[#080706] p-5 shadow-[0_34px_90px_-52px_rgba(0,0,0,1)] sm:p-8">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#f1d27a] to-transparent opacity-80" />
              {submitted ? (
                <div className="py-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[#caa24c] text-[#050505]">
                    <Check className="h-7 w-7" />
                  </div>
                  <h2 className="mt-6 font-serif text-4xl leading-none text-[#f7efe3]">Your RSVP is in.</h2>
                  <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#d7c29a]/72">
                    Luxor has your Grand Opening RSVP in the CRM. We cannot wait to celebrate with you.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-[#caa24c]/18 pb-6 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Saturday, July 25</p>
                    <h2 className="mt-3 font-serif text-4xl leading-none text-[#f7efe3] sm:text-5xl">Reserve your place.</h2>
                    <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#d7c29a]/68">
                      Tell us who is coming and what kind of future event you may be interested in hosting.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <TextField name="firstName" label="First name" required />
                    <TextField name="lastName" label="Last name" required />
                    <TextField name="email" label="Email" type="email" required className="sm:col-span-2" />
                    <TextField name="attendeeCount" label="How many attending?" inputMode="numeric" placeholder="1, 2, 3..." />
                    <label className="block">
                      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">Event interest</span>
                      <PortalSelect
                        value={eventInterest}
                        onChange={setEventInterest}
                        className="mt-2 w-full"
                        placeholder="Select one"
                        options={eventInterests.map((interest) => ({ value: interest, label: interest }))}
                      />
                    </label>
                  </div>

                  <div className="mt-6 grid gap-3">
                    <label className="flex items-start gap-3 rounded-md border border-[#caa24c]/20 bg-black/24 p-4">
                      <input name="willAttend" required type="checkbox" className="mt-1 h-4 w-4 accent-[#caa24c]" />
                      <span>
                        <span className="block text-sm font-bold uppercase tracking-[0.12em] text-[#f7efe3]">I will attend the Grand Opening event</span>
                        <span className="mt-1 block text-xs leading-5 text-[#d7c29a]/62">We will save your spot and send Grand Opening updates to the email above.</span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-md border border-[#caa24c]/14 bg-black/16 p-4">
                      <input
                        type="checkbox"
                        checked={marketingOptIn}
                        onChange={(event) => setMarketingOptIn(event.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#caa24c]"
                      />
                      <span className="text-sm leading-6 text-[#d7c29a]/76">Sign up for Luxor news, updates, and future event invitations.</span>
                    </label>
                  </div>

                  {error ? (
                    <p className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">{error}</p>
                  ) : null}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={submitting}
                    className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-2xl disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {submitting ? 'Submitting RSVP' : 'Submit RSVP'}
                  </motion.button>
                </>
              )}
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

function TextField({
  name,
  label,
  type = 'text',
  required = false,
  placeholder,
  inputMode,
  className = '',
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">{label}</span>
      <input
        name={name}
        required={required}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 w-full rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/35 focus:border-[#f1d27a]/70"
      />
    </label>
  )
}
