'use client'

import { Check, ChevronDown, Loader2, Search, TicketCheck, Users } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type Match = { id: string; full_name: string; checked_in: boolean }
type InviteRsvp = { id: string; full_name: string; email: string; attendee_count: number | null; marketing_opt_in: boolean; checked_in: boolean }

export default function GrandOpeningCheckInPage() {
  return <Suspense fallback={<CheckInLoading />}><GrandOpeningCheckIn /></Suspense>
}

function GrandOpeningCheckIn() {
  const reduceMotion = useReducedMotion()
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('invite') || ''
  const [inviteRsvp, setInviteRsvp] = useState<InviteRsvp | null>(null)
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))
  const [mode, setMode] = useState<'rsvp' | 'guest'>(inviteToken ? 'rsvp' : 'guest')
  const [hostQuery, setHostQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedHost, setSelectedHost] = useState<Match | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [matchedContactId, setMatchedContactId] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [checkedInName, setCheckedInName] = useState('')

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    fetch(`/api/public/grand-opening-check-in?invite=${encodeURIComponent(inviteToken)}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'This check-in link is not valid.')
        if (!cancelled) {
          setInviteRsvp(data.rsvp)
          setEmail(data.rsvp.email || '')
          setMarketingOptIn(Boolean(data.rsvp.marketing_opt_in))
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setMode('guest')
          setError(reason instanceof Error ? reason.message : 'This check-in link is not valid.')
        }
      })
      .finally(() => !cancelled && setInviteLoading(false))
    return () => { cancelled = true }
  }, [inviteToken])

  useEffect(() => {
    if (mode !== 'guest') return
    const fullName = `${firstName} ${lastName}`.trim()
    if (firstName.trim().length < 1 || lastName.trim().length < 1 || phone.replace(/\D/g, '').length !== 10) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ contactName: fullName, contactPhone: phone })
        const response = await fetch(`/api/public/grand-opening-check-in?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to check the CRM contact.')
        if (data.contact) {
          setEmail(data.contact.email)
          setMarketingOptIn(Boolean(data.contact.marketing_opt_in))
          setMatchedContactId(data.contact.id)
        } else if (matchedContactId) {
          setEmail('')
          setMarketingOptIn(false)
          setMatchedContactId('')
        }
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to check the CRM contact.')
      }
    }, 350)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [firstName, lastName, matchedContactId, mode, phone])

  useEffect(() => {
    if (mode !== 'guest' || inviteRsvp || hostQuery.trim().length < 2) {
      if (!inviteRsvp) setMatches([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/public/grand-opening-check-in?q=${encodeURIComponent(hostQuery.trim())}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to search the RSVP list.')
        setMatches(data.matches || [])
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to search the RSVP list.')
      }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [hostQuery, inviteRsvp, mode])

  const host = useMemo<Match | null>(() => {
    if (inviteRsvp) return { id: inviteRsvp.id, full_name: inviteRsvp.full_name, checked_in: inviteRsvp.checked_in }
    return selectedHost
  }, [inviteRsvp, selectedHost])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const payload = mode === 'guest'
        ? {
            mode: 'guest',
            fullName: `${firstName} ${lastName}`.trim(),
            email,
            phone,
            invitedByInquiryId: host?.id || '',
            marketingOptIn,
          }
        : {
            mode: 'rsvp',
            inquiryId: inviteRsvp?.id || '',
            inviteToken,
            email,
            phone,
            marketingOptIn,
          }
      const response = await fetch('/api/public/grand-opening-check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to complete check-in.')
      setCheckedInName(data.attendee.full_name)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete check-in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#050505] px-4 py-8 sm:px-6 sm:py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.22),transparent_30rem),linear-gradient(180deg,#0c0907_0%,#050505_65%)]" />
      <div className="absolute inset-0 luxor-noise opacity-20" />
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.48, ease: [0.23, 1, 0.32, 1] }}
        className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[#caa24c]/28 bg-[#090706]/95 shadow-[0_40px_120px_-48px_rgba(0,0,0,1)]"
      >
        <div className="h-1 bg-gradient-to-r from-[#6d4b1d] via-[#f1d27a] to-[#6d4b1d]" />
        <header className="border-b border-[#caa24c]/15 px-6 py-7 text-center sm:px-9">
          <p className="font-serif text-3xl font-semibold uppercase tracking-[0.2em] text-[#caa24c]">Luxor</p>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.38em] text-[#a98b54]">At Las Palmas Events</p>
          <div className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border border-[#caa24c]/25 bg-[#caa24c]/8 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#f1d27a]">
            <TicketCheck className="h-3.5 w-3.5" /> Grand Opening raffle
          </div>
          <h1 className="mt-5 font-serif text-5xl leading-[0.95] text-[#f7efe3] sm:text-6xl">Check in to win.</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#d7c29a]/68">Only guests who are here and checked in are included in tonight’s prize drawings.</p>
        </header>

        <div className="p-5 sm:p-8">
          <AnimatePresence mode="wait" initial={false}>
          {checkedInName ? (
            <motion.div key="success" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#caa24c] text-[#090706]"><Check className="h-8 w-8" /></div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.25em] text-[#caa24c]">You’re in the raffle</p>
              <h2 className="mt-3 font-serif text-5xl text-[#f7efe3]">Welcome, {checkedInName.split(' ')[0]}.</h2>
              <p className="mt-4 text-sm leading-6 text-[#d7c29a]/70">Stay nearby when winners are announced. If your name is called and you are not present, another winner will be drawn.</p>
              <button type="button" onClick={() => { setCheckedInName(''); setMode('guest'); setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setMatchedContactId(''); setMarketingOptIn(false) }} className="mt-8 text-xs font-bold uppercase tracking-[0.15em] text-[#f1d27a] underline underline-offset-4">Check in another guest</button>
            </motion.div>
          ) : inviteLoading ? <CheckInLoading compact /> : (
            <motion.form key="form" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={submit} className="space-y-5">
              {inviteRsvp ? (
                <div className="grid grid-cols-2 rounded-xl border border-[#caa24c]/20 bg-black/30 p-1">
                  <ModeButton active={mode === 'rsvp'} onClick={() => setMode('rsvp')} icon={<Check className="h-4 w-4" />} label="My check-in" />
                  <ModeButton active={mode === 'guest'} onClick={() => setMode('guest')} icon={<Users className="h-4 w-4" />} label="My guest" />
                </div>
              ) : null}

              {mode === 'rsvp' && inviteRsvp ? (
                <div className="rounded-xl border border-[#caa24c]/22 bg-[#caa24c]/7 p-5 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#caa24c]">RSVP found</p>
                  <p className="mt-2 font-serif text-3xl text-[#f7efe3]">{inviteRsvp.full_name}</p>
                  {inviteRsvp.checked_in ? <p className="mt-2 text-xs text-emerald-300">Already checked in — submitting again is safe.</p> : null}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="firstName" label="First name" value={firstName} onChange={setFirstName} required />
                    <Field name="lastName" label="Last name" value={lastName} onChange={setLastName} required />
                  </div>
                  <div className="relative">
                    <label className="block">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Who invited you? *</span>
                      <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a98b54]" />
                        <input value={host ? host.full_name : hostQuery} onChange={(event) => { setSelectedHost(null); setHostQuery(event.target.value); setError('') }} readOnly={Boolean(inviteRsvp)} placeholder="Start typing their first or last name" className="w-full rounded-lg border border-[#caa24c]/22 bg-black/35 py-3.5 pl-10 pr-10 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#8c795d] focus:border-[#f1d27a]/70" />
                        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a98b54]" />
                      </div>
                    </label>
                    {!selectedHost && !inviteRsvp && matches.length ? (
                      <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-[#caa24c]/30 bg-[#100d0a] p-1 shadow-2xl">
                        {matches.map((match) => <button key={match.id} type="button" onClick={() => { setSelectedHost(match); setHostQuery(match.full_name); setMatches([]) }} className="flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm text-[#f7efe3] transition hover:bg-[#caa24c]/12 focus:bg-[#caa24c]/12"><span>{match.full_name}</span>{match.checked_in ? <Check className="h-4 w-4 text-emerald-400" /> : null}</button>)}
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Email address *</span>
                <input required type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); if (matchedContactId) setMatchedContactId('') }} placeholder="you@example.com" className="mt-2 w-full rounded-lg border border-[#caa24c]/22 bg-black/35 px-4 py-3.5 text-sm text-[#f7efe3] outline-none transition placeholder:text-[#8c795d] focus:border-[#f1d27a]/70" />
                <span className="mt-2 block text-[11px] leading-5 text-[#a99678]">{matchedContactId ? 'Matched to your existing Luxor contact.' : 'Required so we can send event updates and contact you about your raffle entry.'}</span>
              </label>

              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Mobile phone {mode === 'guest' ? '*' : '(optional)'}</span>
                <input required={mode === 'guest'} type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(210) 000-0000" className="mt-2 w-full rounded-lg border border-[#caa24c]/22 bg-black/35 px-4 py-3.5 font-mono text-sm text-[#f7efe3] outline-none transition placeholder:text-[#8c795d] focus:border-[#f1d27a]/70" />
                <span className="mt-2 block text-[11px] leading-5 text-[#a99678]">Used to call you if you win and are away from the raffle screen.</span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-[#caa24c]/14 bg-black/20 p-4">
                <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#caa24c]" />
                <span className="text-xs leading-5 text-[#c8b99f]">Yes, add me to Luxor’s email list for occasional news and future event invitations. This is optional and does not affect raffle entry.</span>
              </label>

              {error ? <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-5 text-red-200">{error}</p> : null}

              <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} disabled={submitting || (mode === 'rsvp' && !inviteRsvp) || (mode === 'guest' && !host)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border border-[#f1d27a]/50 bg-[#caa24c] px-5 text-xs font-black uppercase tracking-[0.18em] text-[#090706] shadow-[0_18px_50px_-24px_rgba(202,162,76,.8)] transition hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:opacity-45">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketCheck className="h-4 w-4" />}{submitting ? 'Checking you in' : 'Enter the raffle'}
              </motion.button>
            </motion.form>
          )}
          </AnimatePresence>
        </div>
      </motion.section>
    </main>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] transition ${active ? 'bg-[#caa24c] text-[#090706]' : 'text-[#bba98e] hover:text-[#f7efe3]'}`}>{icon}{label}</button>
}

function Field({ name, label, value, onChange, required }: { name: string; label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">{label} {required ? '*' : ''}</span><input name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} autoComplete={name === 'firstName' ? 'given-name' : 'family-name'} className="mt-2 w-full rounded-lg border border-[#caa24c]/22 bg-black/35 px-4 py-3.5 text-sm text-[#f7efe3] outline-none transition focus:border-[#f1d27a]/70" /></label>
}

function CheckInLoading({ compact = false }: { compact?: boolean }) {
  return <div className={`${compact ? 'py-16' : 'flex min-h-screen items-center justify-center bg-[#050505]'} text-center text-[#caa24c]`}><Loader2 className="mx-auto h-7 w-7 animate-spin" /><p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em]">Loading check-in</p></div>
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
