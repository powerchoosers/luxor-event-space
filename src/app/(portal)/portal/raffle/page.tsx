'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleDotDashed, Expand, Loader2, Minimize2, Phone, RefreshCw, Search, TicketCheck, UserPlus, Users, X } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { GrandOpeningAttendee, GrandOpeningRsvpCandidate } from '@/lib/luxorGrandOpeningRaffleServer'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export default function GrandOpeningRafflePage() {
  const reduceMotion = useReducedMotion()
  const [attendees, setAttendees] = useState<GrandOpeningAttendee[]>([])
  const [matches, setMatches] = useState<GrandOpeningRsvpCandidate[]>([])
  const [search, setSearch] = useState('')
  const [guestMode, setGuestMode] = useState(false)
  const [selectedHost, setSelectedHost] = useState<GrandOpeningRsvpCandidate | null>(null)
  const [guestFirstName, setGuestFirstName] = useState('')
  const [guestLastName, setGuestLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [matchedContactId, setMatchedContactId] = useState('')
  const [prizeLabel, setPrizeLabel] = useState('')
  const [winner, setWinner] = useState<GrandOpeningAttendee | null>(null)
  const [rollingName, setRollingName] = useState('Ready to draw')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [stageFullscreen, setStageFullscreen] = useState(false)
  const [error, setError] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (query = '') => {
    try {
      setError('')
      const response = await fetch(`/api/raffle${query.trim().length >= 2 ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load the raffle.')
      setAttendees(data.attendees || [])
      setMatches(data.matches || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the raffle.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const syncFullscreenState = () => setStageFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])
  useEffect(() => {
    if (search.trim().length < 2) { setMatches([]); return }
    const timer = window.setTimeout(() => load(search), 220)
    return () => window.clearTimeout(timer)
  }, [load, search])
  useEffect(() => {
    if (!guestMode) return
    const fullName = `${guestFirstName} ${guestLastName}`.trim()
    if (!guestFirstName.trim() || !guestLastName.trim() || phone.replace(/\D/g, '').length !== 10) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ contactName: fullName, contactPhone: phone })
        const response = await fetch(`/api/raffle?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to check the CRM contact.')
        if (data.contact) {
          setEmail(data.contact.email)
          setMarketingOptIn(Boolean(data.contact.marketing_opt_in))
          setMatchedContactId(data.contact.id)
        } else if (matchedContactId) {
          setEmail(''); setMarketingOptIn(false); setMatchedContactId('')
        }
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to check the CRM contact.')
      }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [guestFirstName, guestLastName, guestMode, matchedContactId, phone])

  const eligible = useMemo(() => attendees.filter((person) => person.eligible && !person.winner_at && !person.disqualified_at), [attendees])
  const winners = useMemo(() => attendees.filter((person) => person.winner_at && !person.disqualified_at), [attendees])

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/raffle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Raffle update failed.')
    return data
  }

  async function checkInRsvp(candidate: GrandOpeningRsvpCandidate) {
    setWorking(true); setError('')
    try {
      await post({ action: 'check_in_rsvp', inquiryId: candidate.id, email: candidate.email, phone, marketingOptIn: candidate.marketing_opt_in })
      setSearch(''); setMatches([]); setPhone('')
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check-in failed.') }
    finally { setWorking(false) }
  }

  async function checkInGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true); setError('')
    try {
      await post({
        action: 'check_in_guest',
        fullName: `${guestFirstName} ${guestLastName}`.trim(),
        email,
        phone,
        invitedByInquiryId: selectedHost?.id,
        marketingOptIn,
      })
      event.currentTarget.reset(); setGuestFirstName(''); setGuestLastName(''); setEmail(''); setPhone(''); setMarketingOptIn(false); setMatchedContactId(''); setSelectedHost(null); setSearch(''); setMatches([])
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Guest check-in failed.') }
    finally { setWorking(false) }
  }

  async function draw() {
    if (!eligible.length || drawing) return
    setDrawing(true); setWinner(null); setError('')
    const started = Date.now()
    const roller = reduceMotion ? null : window.setInterval(() => {
      const name = eligible[Math.floor(Math.random() * eligible.length)]?.full_name
      if (name) setRollingName(name)
    }, 85)
    try {
      const dataPromise = post({ action: 'draw', prizeLabel })
      const data = await dataPromise
      const remaining = Math.max(0, (reduceMotion ? 180 : 2300) - (Date.now() - started))
      await new Promise((resolve) => window.setTimeout(resolve, remaining))
      setWinner(data.winner); setRollingName(data.winner.full_name)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to draw a winner.') }
    finally { if (roller) window.clearInterval(roller); setDrawing(false) }
  }

  async function skipWinner() {
    if (!winner) return
    setWorking(true); setError('')
    try {
      await post({ action: 'skip', attendeeId: winner.id })
      setWinner(null); setRollingName('Ready to redraw')
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to skip this winner.') }
    finally { setWorking(false) }
  }

  async function toggleStageFullscreen() {
    try {
      setError('')
      if (document.fullscreenElement === stageRef.current) {
        await document.exitFullscreen()
        return
      }
      await stageRef.current?.requestFullscreen()
    } catch {
      setError('The raffle display could not change screen mode. Please try again.')
    }
  }

  return (
    <PortalPageFrame className="min-h-0 pb-6">
      <PortalPageHeader icon={<TicketCheck size={19} />} title="Grand Opening Raffle" description="Check guests in on the iPad, then put the live drawing stage on the big screen. Only checked-in guests enter the draw." actions={<PortalButton onClick={() => load()}><RefreshCw size={13} /> Refresh</PortalButton>} />

      {error ? <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-400">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,.82fr)_minmax(520px,1.18fr)]">
        <motion.section initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.23, 1, 0.32, 1] }} className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl">
          <div className="border-b border-[color:var(--portal-border)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">iPad station</p><h2 className="mt-1 text-lg font-bold text-[color:var(--portal-text)]">Manual check-in</h2></div>
              <div className="flex rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
                <SmallMode active={!guestMode} onClick={() => { setGuestMode(false); setSelectedHost(null) }}>RSVP</SmallMode>
                <SmallMode active={guestMode} onClick={() => setGuestMode(true)}>Guest</SmallMode>
              </div>
            </div>
          </div>

          <div className="p-5">
            {!guestMode ? (
              <div className="space-y-4">
                <SearchBox value={search} onChange={setSearch} placeholder="Search the RSVP name…" />
                <PhoneInput value={phone} onChange={setPhone} optional />
                <div className="max-h-[390px] space-y-2 overflow-y-auto portal-scrollbar">
                  {loading ? <CenteredLoader /> : search.trim().length < 2 ? <Hint icon={<Search size={18} />} text="Type at least two letters to find an RSVP." /> : matches.length ? matches.map((candidate) => (
                    <button key={candidate.id} disabled={working || candidate.checked_in} onClick={() => checkInRsvp(candidate)} className="flex w-full items-center justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-left transition hover:border-[#caa24c]/35 disabled:opacity-55">
                      <span className="min-w-0"><span className="block text-sm font-bold text-[color:var(--portal-text)]">{candidate.full_name}</span><span className="mt-1 block truncate text-[10px] text-[color:var(--portal-muted)]">{candidate.email || 'Email missing'} · {candidate.attendee_count || 1} on RSVP{candidate.marketing_opt_in ? ' · Marketing on' : ''}</span></span>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${candidate.checked_in ? 'bg-emerald-500/12 text-emerald-500' : 'bg-[#caa24c]/12 text-[#caa24c]'}`}>{candidate.checked_in ? 'Checked in' : 'Check in'}</span>
                    </button>
                  )) : <Hint icon={<Users size={18} />} text="No matching Grand Opening RSVP was found." />}
                </div>
              </div>
            ) : (
              <form onSubmit={checkInGuest} className="space-y-4">
                <div className="grid grid-cols-2 gap-3"><SimpleInput name="firstName" label="First name" value={guestFirstName} onChange={setGuestFirstName} required /><SimpleInput name="lastName" label="Last name" value={guestLastName} onChange={setGuestLastName} required /></div>
                <PhoneInput value={phone} onChange={setPhone} />
                <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#caa24c]">Email *</span><input required type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (matchedContactId) setMatchedContactId('') }} placeholder="guest@example.com" className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /><span className="mt-1.5 block text-[10px] text-[color:var(--portal-muted)]">{matchedContactId ? 'Autofilled from the existing CRM contact.' : 'Required for every raffle ticket.'}</span></label>
                <div className="relative">
                  <SearchBox value={selectedHost ? selectedHost.full_name : search} onChange={(value) => { setSelectedHost(null); setSearch(value) }} placeholder="Search who invited them…" label="Main RSVP" />
                  {!selectedHost && matches.length ? <div className="absolute z-20 mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1 shadow-2xl">{matches.slice(0, 8).map((candidate) => <button key={candidate.id} type="button" onClick={() => { setSelectedHost(candidate); setSearch(candidate.full_name); setMatches([]) }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">{candidate.full_name}</button>)}</div> : null}
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3"><input name="marketingOptIn" type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#caa24c]" /><span className="text-[11px] leading-5 text-[color:var(--portal-muted)]">Add this email to Luxor’s marketing list. Existing members are prechecked automatically.</span></label>
                <PortalButton type="submit" variant="primary" disabled={working || !selectedHost} className="w-full"><UserPlus size={14} /> {working ? 'Checking in' : 'Add guest & check in'}</PortalButton>
              </form>
            )}
          </div>

          <div className="border-t border-[color:var(--portal-border)] p-5">
            <div className="grid grid-cols-3 gap-2"><Metric label="Present" value={attendees.length} /><Metric label="Eligible" value={eligible.length} /><Metric label="Winners" value={winners.length} /></div>
            <div className="mt-4 max-h-48 space-y-1 overflow-y-auto portal-scrollbar">
              {attendees.slice(0, 20).map((person) => <div key={person.id} className="flex items-center justify-between rounded-lg px-2 py-2 text-xs"><span className="truncate font-semibold text-[color:var(--portal-text)]">{person.full_name}</span><span className="ml-3 shrink-0 text-[9px] uppercase tracking-wider text-[color:var(--portal-muted)]">{person.attendee_type}</span></div>)}
            </div>
          </div>
        </motion.section>

        <motion.section ref={stageRef} initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.52, delay: reduceMotion ? 0 : 0.06, ease: [0.23, 1, 0.32, 1] }} className="relative isolate flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-[#caa24c]/25 bg-[#050505] text-[#f7efe3] shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(202,162,76,.23),transparent_28rem),linear-gradient(180deg,#110d09,#050505_72%)]" />
          <div className="absolute inset-0 luxor-noise opacity-20" />
          <div className="relative flex items-center justify-between border-b border-[#caa24c]/15 px-6 py-5">
            <div><p className="font-serif text-2xl uppercase tracking-[0.2em] text-[#caa24c]">Luxor</p><p className="mt-1 text-[8px] uppercase tracking-[0.33em] text-[#9f8250]">Grand Opening Raffle</p></div>
            <button
              type="button"
              onClick={toggleStageFullscreen}
              className={`flex h-10 items-center justify-center gap-2 rounded-lg border border-[#caa24c]/25 px-3 text-[#caa24c] transition-colors hover:border-[#caa24c]/45 hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1d27a]/70 ${stageFullscreen ? 'bg-[#caa24c]/10' : ''}`}
              aria-label={stageFullscreen ? 'Exit raffle full screen' : 'Show raffle full screen'}
              aria-pressed={stageFullscreen}
              title={stageFullscreen ? 'Exit full screen' : 'Show full screen'}
            >
              {stageFullscreen ? <Minimize2 size={17} /> : <Expand size={17} />}
              {stageFullscreen ? <span className="text-[9px] font-black uppercase tracking-[0.16em]">Exit full screen</span> : null}
            </button>
          </div>
          <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:px-8">
            <DrawMechanism drawing={drawing} winner={Boolean(winner)} drawNumber={winners.length + (winner ? 0 : 1)} reduceMotion={Boolean(reduceMotion)} />
            <div className="mt-8 w-full max-w-4xl">
              <div className="flex items-center justify-between border-b border-[#caa24c]/18 pb-3 font-mono text-[8px] uppercase tracking-[0.24em] text-[#9f8250]">
                <span>Presence verified</span><span>Secure random selection</span>
              </div>
              <div className="relative flex min-h-48 items-center justify-center overflow-hidden border-b border-[#caa24c]/18 px-3 py-8 sm:min-h-56">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#caa24c]/30 to-transparent" />
                {drawing && !reduceMotion ? <motion.div initial={{ x: '-110%' }} animate={{ x: '110%' }} transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }} className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#caa24c]/8 to-transparent" /> : null}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.h2
                    key={winner?.id || rollingName}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: drawing ? 22 : 10, filter: 'blur(7px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, filter: 'blur(6px)' }}
                    transition={{ duration: reduceMotion ? 0.12 : drawing ? 0.09 : 0.42, ease: [0.23, 1, 0.32, 1] }}
                    className={`max-w-4xl font-serif leading-[.88] ${winner ? 'text-7xl sm:text-8xl 2xl:text-9xl' : 'text-5xl sm:text-7xl'} text-[#f7efe3]`}
                  >
                    {winner?.full_name || rollingName}
                  </motion.h2>
                </AnimatePresence>
              </div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-[#caa24c]">{winner ? 'Selected winner' : drawing ? 'Names are being mixed' : `${eligible.length} verified guests available`}</p>
            </div>
            <AnimatePresence>
              {winner ? <motion.div initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                {winner.phone ? <a href={`tel:${winner.phone}`} className="inline-flex items-center gap-2 rounded-full border border-[#caa24c]/25 bg-black/30 px-4 py-2 font-mono text-sm text-[#f1d27a]"><Phone size={14} /> {formatDisplayPhone(winner.phone)}</a> : <p className="text-sm text-[#a99678]">No phone number provided — call their name in the room.</p>}
                {winner.prize_label ? <p className="mt-5 text-sm font-bold uppercase tracking-[0.18em] text-[#d7c29a]">{winner.prize_label}</p> : null}
              </motion.div> : null}
            </AnimatePresence>
          </div>
          <div className="relative border-t border-[#caa24c]/15 bg-black/25 p-5 sm:p-6">
            <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Prize name (optional)</span><input value={prizeLabel} onChange={(event) => setPrizeLabel(event.target.value)} placeholder="Example: Venue credit" className="mt-2 w-full rounded-lg border border-[#caa24c]/20 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#7e6e58] focus:border-[#f1d27a]/60" /></label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              {winner ? <><button onClick={() => { setWinner(null); setRollingName('Ready for the next prize'); setPrizeLabel('') }} className="min-h-12 flex-1 rounded-lg border border-[#caa24c]/30 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#f1d27a] transition hover:bg-[#caa24c]/8">Confirm winner</button><button disabled={working} onClick={skipWinner} className="min-h-12 flex-1 rounded-lg border border-red-500/25 bg-red-500/10 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-red-300 transition hover:bg-red-500/15"><X size={14} className="mr-2 inline" />Not present — redraw</button></> : <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} disabled={drawing || !eligible.length} onClick={draw} className="min-h-14 w-full rounded-lg border border-[#f1d27a]/50 bg-[#caa24c] px-6 text-xs font-black uppercase tracking-[0.2em] text-[#090706] shadow-[0_20px_55px_-28px_rgba(202,162,76,.9)] disabled:opacity-40"><CircleDotDashed size={15} className="mr-2 inline" />{drawing ? 'Mixing entries…' : 'Begin random draw'}</motion.button>}
            </div>
          </div>
        </motion.section>
      </div>
    </PortalPageFrame>
  )
}

function DrawMechanism({ drawing, winner, drawNumber, reduceMotion }: { drawing: boolean; winner: boolean; drawNumber: number; reduceMotion: boolean }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center" aria-hidden="true">
      <motion.div
        animate={drawing && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
        transition={drawing && !reduceMotion ? { duration: 1.1, repeat: Infinity, ease: 'linear' } : { duration: 0.35 }}
        className={`absolute inset-1 rounded-full border ${winner ? 'border-[#f1d27a]' : 'border-[#caa24c]/45'}`}
      >
        {[0, 90, 180, 270].map((rotation) => <span key={rotation} style={{ transform: `translateX(-50%) rotate(${rotation}deg)`, transformOrigin: '50% 43px' }} className="absolute left-1/2 top-0 h-2.5 w-px bg-[#caa24c]" />)}
      </motion.div>
      <motion.div animate={winner && !reduceMotion ? { scale: [0.86, 1.06, 1] } : { scale: 1 }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }} className={`relative flex h-16 w-16 flex-col items-center justify-center rounded-full border ${winner ? 'border-[#f1d27a] bg-[#caa24c] text-[#090706]' : 'border-[#caa24c]/25 bg-[#caa24c]/8 text-[#f1d27a]'} shadow-[0_0_55px_-20px_rgba(202,162,76,.8)]`}>
        <span className="font-mono text-[7px] font-bold uppercase tracking-[0.22em]">Draw</span>
        <span className="mt-0.5 font-mono text-lg font-black leading-none">{String(Math.max(drawNumber, 1)).padStart(2, '0')}</span>
      </motion.div>
    </div>
  )
}

function SmallMode({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`relative isolate overflow-hidden rounded-md px-3 py-2 text-[9px] font-black uppercase tracking-wider transition-colors ${active ? 'text-white' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>{active ? <motion.span layoutId="raffle-check-in-mode" transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} className="absolute inset-0 -z-10 rounded-md bg-[#caa24c]" /> : null}<span className="relative">{children}</span></button>
}
function SearchBox({ value, onChange, placeholder, label = 'RSVP name' }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) { return <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#caa24c]">{label}</span><div className="relative mt-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-3 pl-9 pr-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></div></label> }
function PhoneInput({ value, onChange, optional = false }: { value: string; onChange: (value: string) => void; optional?: boolean }) { return <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#caa24c]">Phone {optional ? '(optional)' : '*'}</span><input required={!optional} value={value} onChange={(event) => onChange(formatPhone(event.target.value))} placeholder="(210) 000-0000" className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 font-mono text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label> }
function SimpleInput({ name, label, value, onChange, required }: { name: string; label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#caa24c]">{label}</span><input name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label> }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-center"><p className="font-mono text-xl font-bold text-[color:var(--portal-text)]">{value}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">{label}</p></div> }
function Hint({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="py-10 text-center text-[color:var(--portal-muted)]"><div className="mx-auto mb-3 w-fit text-[#caa24c]">{icon}</div><p className="text-xs">{text}</p></div> }
function CenteredLoader() { return <div className="py-12 text-center text-[#caa24c]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> }
function formatPhone(value: string) { const digits = value.replace(/\D/g, '').slice(0, 10); if (digits.length <= 3) return digits; if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`; return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` }
function formatDisplayPhone(value: string) { const digits = value.replace(/\D/g, '').slice(-10); return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value }
