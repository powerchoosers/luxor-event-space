'use client'

import { FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, MessageCircle } from 'lucide-react'
import { formatStandardPhoneInput } from '@/lib/luxorPhoneClient'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

export default function SmsSignupPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [customerCareAgreed, setCustomerCareAgreed] = useState(false)
  const [marketingAgreed, setMarketingAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const cleanPhone = phone.trim()
    if (!name.trim()) return setError('Please enter your name.')
    if (cleanPhone.replace(/\D/g, '').length < 10) return setError('Please enter a complete mobile number.')
    if (!customerCareAgreed && !marketingAgreed) return setError('Please select at least one text-message preference.')

    setSubmitting(true)
    const payload: LuxorInquiryInput = {
      fullName: name.trim(),
      phone: cleanPhone,
      smsOptIn: customerCareAgreed,
      smsMarketingOptIn: marketingAgreed,
      eventType: 'Text messaging consent',
      message: 'Public SMS consent form submission.',
      source: 'website_sms_signup',
      flow: 'website_sms_signup',
      pagePath: window.location.pathname,
      referrer: document.referrer,
      formStartedAt: startedAt.current,
      metadata: { consentPage: 'sms-signup', disclosureVersion: '2026-07-27' },
    }

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'We could not save your text-message preference.')
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not save your text-message preference.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-5 pb-24 pt-36 text-[#f7efe3] sm:px-6 lg:pt-44">
      <section className="mx-auto max-w-2xl rounded-lg border border-[#caa24c]/24 bg-[#080706] p-6 shadow-[0_34px_90px_-58px_rgba(0,0,0,0.95)] sm:p-9">
        {submitted ? (
          <div className="py-8 text-center" role="status">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#caa24c] text-[#050505]"><Check className="h-6 w-6" /></div>
            <h1 className="mt-5 font-serif text-4xl">Your text preference is saved.</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#d7c29a]/75">Luxor will only text you as described in the consent you accepted. You can reply STOP at any time.</p>
          </div>
        ) : (
          <>
            <MessageCircle className="h-6 w-6 text-[#d7b964]" />
            <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#d7b964]">Luxor text messages</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Stay in touch about your Luxor plans.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#d7c29a]/75">Choose the kinds of texts you would like to receive from Luxor. Customer-care and promotional consent are separate choices.</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">Full name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-2 h-12 w-full rounded-md border border-[#caa24c]/24 bg-black/35 px-4 text-sm text-[#f7efe3] outline-none transition focus:border-[#f1d27a]/70" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7b964]">Mobile number</span>
                <input value={phone} onChange={(event) => setPhone(formatStandardPhoneInput(event.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="(210) 000-0000" className="mt-2 h-12 w-full rounded-md border border-[#caa24c]/24 bg-black/35 px-4 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#d7c29a]/42 focus:border-[#f1d27a]/70" />
              </label>
              <div className="rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={customerCareAgreed} onChange={(event) => setCustomerCareAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#caa24c]" />
                  <span className="text-xs leading-5 text-[#d7c29a]/75">I agree to receive customer-care text messages from Luxor Event Space about my inquiry, tour, booking, payment, or event. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.</span>
                </label>
                <p className="ml-7 mt-2 text-xs leading-5 text-[#d7c29a]/58">Read the <Link href="/privacy" className="text-[#f1d27a] underline underline-offset-4">Privacy Policy</Link> and <Link href="/terms" className="text-[#f1d27a] underline underline-offset-4">Terms</Link>.</p>
              </div>
              <div className="rounded-lg border border-[#caa24c]/16 bg-white/[0.02] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={marketingAgreed} onChange={(event) => setMarketingAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#caa24c]" />
                  <span className="text-xs leading-5 text-[#d7c29a]/75">I agree to receive occasional promotional text messages from Luxor Event Space, such as venue open-house invitations and planning offers. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.</span>
                </label>
                <p className="ml-7 mt-2 text-xs leading-5 text-[#d7c29a]/58">This optional marketing consent is separate from customer-care messages. Read the <Link href="/privacy" className="text-[#f1d27a] underline underline-offset-4">Privacy Policy</Link> and <Link href="/terms" className="text-[#f1d27a] underline underline-offset-4">Terms</Link>.</p>
              </div>
              {error ? <p role="alert" className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
              <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#050505] transition hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:opacity-70">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                {submitting ? 'Saving preferences…' : 'Save text preferences'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
