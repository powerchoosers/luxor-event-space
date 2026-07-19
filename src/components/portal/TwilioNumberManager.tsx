'use client'

import { Check, Laptop, Loader2, MapPin, MessageSquare, Phone, RefreshCw, Save, Search, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from './ToastProvider'

type AvailableNumber = { phoneNumber: string; friendlyName: string; locality: string | null; region: string | null; postalCode: string | null; capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }; addressRequirements: string }
type OwnedNumber = { sid: string; phoneNumber: string; friendlyName: string; capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }; isActive: boolean; webhooksConfigured: boolean }
type RoutingSettings = {
  ring_to_number: string | null; outbound_mode: 'browser' | 'ring_phone'; ring_browser: boolean; ring_phone: boolean
  missed_call_text_enabled: boolean; missed_call_text_body: string
  inbound_text_reply_enabled: boolean; inbound_text_reply_body: string; inbound_text_reply_cooldown_hours: number
}

export function TwilioNumberManager() {
  const { notify } = useToast()
  const [areaCode, setAreaCode] = useState('210')
  const [available, setAvailable] = useState<AvailableNumber[]>([])
  const [owned, setOwned] = useState<OwnedNumber[]>([])
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null)
  const [priceUnit, setPriceUnit] = useState('USD')
  const [searching, setSearching] = useState(false)
  const [loadingOwned, setLoadingOwned] = useState(true)
  const [selected, setSelected] = useState<AvailableNumber | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [workingSid, setWorkingSid] = useState<string | null>(null)
  const [routing, setRouting] = useState<RoutingSettings>({
    ring_to_number: null, outbound_mode: 'browser', ring_browser: true, ring_phone: false,
    missed_call_text_enabled: false,
    missed_call_text_body: 'Luxor Event Space: Sorry we missed your call. Reply with your name, event date, and event type, and we will get back to you. Reply STOP to opt out.',
    inbound_text_reply_enabled: false,
    inbound_text_reply_body: 'Luxor Event Space: Thanks for your message. We received it and will respond as soon as possible. Reply STOP to opt out.',
    inbound_text_reply_cooldown_hours: 12,
  })
  const [loadingRouting, setLoadingRouting] = useState(true)
  const [savingRouting, setSavingRouting] = useState(false)

  const loadOwned = useCallback(async () => {
    setLoadingOwned(true)
    try {
      const response = await fetch('/api/twilio/phone-numbers?mode=owned', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load Twilio numbers.')
      setOwned(data.numbers || [])
    } catch (error) {
      notify({ title: 'Twilio numbers unavailable', description: error instanceof Error ? error.message : 'Unable to load numbers.', variant: 'error' })
    } finally { setLoadingOwned(false) }
  }, [notify])

  useEffect(() => { void loadOwned() }, [loadOwned])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/twilio/phone-settings', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load call routing.')
        setRouting(data)
      } catch (error) {
        notify({ title: 'Call routing unavailable', description: error instanceof Error ? error.message : 'Unable to load settings.', variant: 'error' })
      } finally { setLoadingRouting(false) }
    })()
  }, [notify])

  async function saveRouting() {
    setSavingRouting(true)
    try {
      const response = await fetch('/api/twilio/phone-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ringToNumber: routing.ring_to_number,
          outboundMode: routing.outbound_mode,
          ringBrowser: routing.ring_browser,
          ringPhone: routing.ring_phone,
          missedCallTextEnabled: routing.missed_call_text_enabled,
          missedCallTextBody: routing.missed_call_text_body,
          inboundTextReplyEnabled: routing.inbound_text_reply_enabled,
          inboundTextReplyBody: routing.inbound_text_reply_body,
          inboundTextReplyCooldownHours: routing.inbound_text_reply_cooldown_hours,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save call routing.')
      setRouting(data)
      notify({ title: 'Phone and text settings saved', description: 'Luxor will use these choices for calls and text automations.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Could not save routing', description: error instanceof Error ? error.message : 'Unable to save settings.', variant: 'error' })
    } finally { setSavingRouting(false) }
  }

  async function searchNumbers() {
    if (!/^\d{3}$/.test(areaCode)) { notify({ title: 'Enter a three-digit area code.', variant: 'error' }); return }
    setSearching(true); setAvailable([])
    try {
      const response = await fetch(`/api/twilio/phone-numbers?mode=available&areaCode=${areaCode}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to search Twilio.')
      setAvailable(data.numbers || []); setMonthlyPrice(data.monthlyPrice); setPriceUnit(data.priceUnit || 'USD')
    } catch (error) { notify({ title: 'Number search failed', description: error instanceof Error ? error.message : 'Unable to search.', variant: 'error' }) } finally { setSearching(false) }
  }

  async function purchase() {
    if (!selected) return
    setWorkingSid(selected.phoneNumber)
    try {
      const response = await fetch('/api/twilio/phone-numbers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'purchase', phoneNumber: selected.phoneNumber, confirmation, monthlyPrice, priceUnit }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Twilio could not purchase that number.')
      notify({ title: 'Luxor number purchased and activated', description: `${selected.friendlyName} is configured for calls and texts.`, variant: 'success' })
      setSelected(null); setConfirmation(''); setAvailable((current) => current.filter((number) => number.phoneNumber !== selected.phoneNumber)); await loadOwned()
    } catch (error) { notify({ title: 'Purchase failed', description: error instanceof Error ? error.message : 'Unable to purchase number.', variant: 'error' }) } finally { setWorkingSid(null) }
  }

  async function activate(number: OwnedNumber) {
    setWorkingSid(number.sid)
    try {
      const response = await fetch('/api/twilio/phone-numbers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'activate', sid: number.sid }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to activate number.')
      notify({ title: 'Active Luxor number changed', description: `${number.phoneNumber} now handles outgoing calls and texts.`, variant: 'success' }); await loadOwned()
    } catch (error) { notify({ title: 'Activation failed', description: error instanceof Error ? error.message : 'Unable to activate number.', variant: 'error' }) } finally { setWorkingSid(null) }
  }

  return <div className="space-y-5">
    <div className="rounded-xl border border-zinc-900 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3"><div><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Call routing</h4><p className="mt-1 text-[10px] leading-relaxed text-zinc-600">Choose how calls leave the CRM and where incoming calls ring.</p></div><Smartphone size={17} className="text-[#caa24c]"/></div>
      {loadingRouting ? <p className="py-6 text-center text-xs text-zinc-600"><Loader2 size={14} className="mr-2 inline animate-spin"/>Loading routing</p> : <>
        <label className="mt-4 block text-[9px] font-black uppercase tracking-wider text-zinc-500">Your real phone number</label>
        <input type="tel" value={routing.ring_to_number || ''} onChange={(event) => setRouting((current) => ({ ...current, ring_to_number: event.target.value }))} placeholder="(210) 555-0123" className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 font-mono text-xs text-white outline-none focus:border-[#caa24c]/40"/>
        <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">This phone can ring first for CRM calls and can receive business calls when the browser is closed.</p>

        <p className="mt-5 text-[9px] font-black uppercase tracking-wider text-zinc-500">When I click Call</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setRouting((current) => ({ ...current, outbound_mode: 'browser' }))} className={`rounded-xl border p-3 text-left ${routing.outbound_mode === 'browser' ? 'border-[#caa24c]/40 bg-[#caa24c]/8' : 'border-zinc-900 bg-black/20'}`}><Laptop size={15} className={routing.outbound_mode === 'browser' ? 'text-[#caa24c]' : 'text-zinc-600'}/><p className="mt-2 text-[10px] font-bold text-white">Use browser microphone</p><p className="mt-1 text-[9px] text-zinc-600">Talk through this computer.</p></button>
          <button type="button" onClick={() => setRouting((current) => ({ ...current, outbound_mode: 'ring_phone' }))} className={`rounded-xl border p-3 text-left ${routing.outbound_mode === 'ring_phone' ? 'border-[#caa24c]/40 bg-[#caa24c]/8' : 'border-zinc-900 bg-black/20'}`}><Smartphone size={15} className={routing.outbound_mode === 'ring_phone' ? 'text-[#caa24c]' : 'text-zinc-600'}/><p className="mt-2 text-[10px] font-bold text-white">Ring my phone first</p><p className="mt-1 text-[9px] text-zinc-600">Answer your phone, then Twilio calls the customer.</p></button>
        </div>

        <p className="mt-5 text-[9px] font-black uppercase tracking-wider text-zinc-500">Incoming business calls</p>
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-900 bg-black/20 p-3"><input type="checkbox" checked={routing.ring_browser} onChange={(event) => setRouting((current) => ({ ...current, ring_browser: event.target.checked }))} className="accent-[#caa24c]"/><span><span className="block text-[10px] font-bold text-white">Ring the browser</span><span className="block text-[9px] text-zinc-600">Works while the portal phone is enabled and open.</span></span></label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-900 bg-black/20 p-3"><input type="checkbox" checked={routing.ring_phone} onChange={(event) => setRouting((current) => ({ ...current, ring_phone: event.target.checked }))} className="accent-[#caa24c]"/><span><span className="block text-[10px] font-bold text-white">Ring my real phone</span><span className="block text-[9px] text-zinc-600">Keeps working even when the portal is closed.</span></span></label>
        </div>

        <div className="mt-5 border-t border-zinc-900 pt-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Text automations</p><p className="mt-1 text-[9px] leading-relaxed text-zinc-600">Both are off until you enable them. Every automated text is saved in message history and protected against duplicates.</p></div><MessageSquare size={15} className="text-[#caa24c]"/></div>

          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-900 bg-black/20 p-3"><input type="checkbox" checked={routing.missed_call_text_enabled} onChange={(event) => setRouting((current) => ({ ...current, missed_call_text_enabled: event.target.checked }))} className="accent-[#caa24c]"/><span><span className="block text-[10px] font-bold text-white">Text after a missed call</span><span className="block text-[9px] text-zinc-600">Sent only when nobody answers. Voicemail still works.</span></span></label>
          <textarea value={routing.missed_call_text_body} onChange={(event) => setRouting((current) => ({ ...current, missed_call_text_body: event.target.value.slice(0, 480) }))} rows={4} disabled={!routing.missed_call_text_enabled} className="mt-2 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-xs leading-relaxed text-white outline-none disabled:opacity-45"/>
          <p className="mt-1 text-right font-mono text-[8px] text-zinc-700">{routing.missed_call_text_body.length}/480</p>

          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-900 bg-black/20 p-3"><input type="checkbox" checked={routing.inbound_text_reply_enabled} onChange={(event) => setRouting((current) => ({ ...current, inbound_text_reply_enabled: event.target.checked }))} className="accent-[#caa24c]"/><span><span className="block text-[10px] font-bold text-white">Acknowledge incoming texts</span><span className="block text-[9px] text-zinc-600">Confirms receipt once per customer during the cooldown.</span></span></label>
          <textarea value={routing.inbound_text_reply_body} onChange={(event) => setRouting((current) => ({ ...current, inbound_text_reply_body: event.target.value.slice(0, 480) }))} rows={4} disabled={!routing.inbound_text_reply_enabled} className="mt-2 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-xs leading-relaxed text-white outline-none disabled:opacity-45"/>
          <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[9px] text-zinc-600">Do not repeat for the same person for</p><div className="flex items-center gap-2"><input type="number" min={1} max={168} value={routing.inbound_text_reply_cooldown_hours} onChange={(event) => setRouting((current) => ({ ...current, inbound_text_reply_cooldown_hours: Number(event.target.value) || 12 }))} disabled={!routing.inbound_text_reply_enabled} className="h-9 w-16 rounded-lg border border-zinc-800 bg-black/40 px-2 text-center font-mono text-xs text-white outline-none disabled:opacity-45"/><span className="text-[9px] text-zinc-600">hours</span></div></div>
          <p className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[9px] leading-relaxed text-amber-200/75">Luxor blocks CRM texts after STOP and allows them again only after START. Keep the business name and “Reply STOP to opt out” in automated first-contact messages.</p>
        </div>
        <button type="button" onClick={() => void saveRouting()} disabled={savingRouting} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#caa24c] text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50">{savingRouting ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} {savingRouting ? 'Saving' : 'Save phone & text settings'}</button>
      </>}
    </div>
    <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 p-4"><div className="flex gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#caa24c]"/><div><p className="text-xs font-black text-white">Purchase protection</p><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Twilio charges the full monthly price as soon as you buy a number. The site requires you to type the exact number before the purchase can happen. Voice and SMS usage cost extra.</p></div></div></div>
    <div><div className="mb-3 flex items-center justify-between"><div><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Owned Twilio numbers</h4><p className="mt-1 text-[10px] text-zinc-600">The active number is used for outgoing browser calls and texts.</p></div><button type="button" onClick={() => void loadOwned()} className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"><RefreshCw size={13}/></button></div>
      {loadingOwned ? <p className="py-4 text-center text-xs text-zinc-600"><Loader2 size={14} className="mr-2 inline animate-spin"/>Loading numbers</p> : <div className="space-y-2">{owned.length > 0 && !owned.some((number) => number.isActive) && <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-300">Choose “Activate & configure” on the number Luxor should publish and use for outgoing calls and texts.</p>}{owned.map((number) => <div key={number.sid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black/25 px-4 py-3"><div><p className="font-mono text-sm font-bold text-white">{formatPhone(number.phoneNumber)}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">{number.capabilities.voice ? 'Voice' : ''}{number.capabilities.sms ? ' · SMS' : ''}{number.capabilities.mms ? ' · MMS' : ''} · {number.webhooksConfigured ? 'Webhooks ready' : 'Needs configuration'}</p></div>{number.isActive ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400"><Check size={11}/> Active</span> : <button type="button" disabled={workingSid === number.sid} onClick={() => void activate(number)} className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/8 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#caa24c] disabled:opacity-40">{workingSid === number.sid ? 'Activating…' : 'Activate & configure'}</button>}</div>)}</div>}
    </div>
    <div className="border-t border-zinc-900 pt-5"><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Find a new local number</h4><div className="mt-3 flex gap-2"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3"><MapPin size={14} className="text-zinc-600"/><input value={areaCode} onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Area code" inputMode="numeric" className="h-10 min-w-0 flex-1 bg-transparent text-xs text-white outline-none"/></div><button type="button" onClick={() => void searchNumbers()} disabled={searching || areaCode.length !== 3} className="inline-flex items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-40">{searching ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} Search</button></div>
      {monthlyPrice !== null && <p className="mt-2 text-[9px] text-zinc-600">Current Twilio local-number price: {new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)} per month, plus usage and compliance fees.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{available.map((number) => <button key={number.phoneNumber} type="button" onClick={() => { setSelected(number); setConfirmation('') }} className="rounded-xl border border-zinc-900 bg-black/25 p-4 text-left hover:border-[#caa24c]/30"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold text-white">{formatPhone(number.phoneNumber)}</span><Phone size={14} className="text-[#caa24c]"/></div><p className="mt-2 text-[9px] uppercase tracking-wider text-zinc-600">{[number.locality, number.region].filter(Boolean).join(', ') || 'United States'} · Voice · SMS{number.capabilities.mms ? ' · MMS' : ''}</p></button>)}</div>
      {!searching && available.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-zinc-850 px-4 py-6 text-center text-xs text-zinc-600">Search an area code to see numbers currently available from Twilio.</p>}
    </div>
    {selected && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs font-black text-amber-300">Confirm a real Twilio purchase</p><p className="mt-2 text-[10px] leading-relaxed text-zinc-400">Buying <span className="font-mono text-white">{selected.phoneNumber}</span> immediately adds Twilio’s monthly charge{monthlyPrice !== null ? ` of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)}` : ''}. Type the complete number below to authorize it.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value.trim())} placeholder={selected.phoneNumber} className="mt-3 h-10 w-full rounded-lg border border-amber-500/20 bg-black/50 px-3 font-mono text-xs text-white outline-none"/><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-zinc-800 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-zinc-500">Cancel</button><button type="button" onClick={() => void purchase()} disabled={confirmation !== selected.phoneNumber || workingSid === selected.phoneNumber} className="rounded-lg bg-amber-400 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-black disabled:opacity-35">{workingSid === selected.phoneNumber ? 'Purchasing…' : 'Buy & activate number'}</button></div></div>}
  </div>
}

function formatPhone(value: string) { const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return digits.length === 10 ? `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value }
