'use client'

import { Check, Loader2, MapPin, Phone, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from './ToastProvider'

type AvailableNumber = { phoneNumber: string; friendlyName: string; locality: string | null; region: string | null; postalCode: string | null; capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }; addressRequirements: string }
type OwnedNumber = { sid: string; phoneNumber: string; friendlyName: string; capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }; isActive: boolean; webhooksConfigured: boolean }

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
    <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 p-4"><div className="flex gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#caa24c]"/><div><p className="text-xs font-black text-white">Purchase protection</p><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Twilio charges the full monthly price as soon as you buy a number. The site requires you to type the exact number before the purchase can happen. Voice and SMS usage cost extra.</p></div></div></div>
    <div><div className="mb-3 flex items-center justify-between"><div><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Owned Twilio numbers</h4><p className="mt-1 text-[10px] text-zinc-600">The active number is used for outgoing browser calls and texts.</p></div><button type="button" onClick={() => void loadOwned()} className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"><RefreshCw size={13}/></button></div>
      {loadingOwned ? <p className="py-4 text-center text-xs text-zinc-600"><Loader2 size={14} className="mr-2 inline animate-spin"/>Loading numbers</p> : <div className="space-y-2">{owned.map((number) => <div key={number.sid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black/25 px-4 py-3"><div><p className="font-mono text-sm font-bold text-white">{formatPhone(number.phoneNumber)}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">{number.capabilities.voice ? 'Voice' : ''}{number.capabilities.sms ? ' · SMS' : ''}{number.capabilities.mms ? ' · MMS' : ''} · {number.webhooksConfigured ? 'Webhooks ready' : 'Needs configuration'}</p></div>{number.isActive ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400"><Check size={11}/> Active</span> : <button type="button" disabled={workingSid === number.sid} onClick={() => void activate(number)} className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/8 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#caa24c] disabled:opacity-40">{workingSid === number.sid ? 'Activating…' : 'Activate & configure'}</button>}</div>)}</div>}
    </div>
    <div className="border-t border-zinc-900 pt-5"><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Find a new local number</h4><div className="mt-3 flex gap-2"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3"><MapPin size={14} className="text-zinc-600"/><input value={areaCode} onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Area code" inputMode="numeric" className="h-10 min-w-0 flex-1 bg-transparent text-xs text-white outline-none"/></div><button type="button" onClick={() => void searchNumbers()} disabled={searching || areaCode.length !== 3} className="inline-flex items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-40">{searching ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} Search</button></div>
      {monthlyPrice !== null && <p className="mt-2 text-[9px] text-zinc-600">Current Twilio local-number price: {new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)} per month, plus usage and compliance fees.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{available.map((number) => <button key={number.phoneNumber} type="button" onClick={() => { setSelected(number); setConfirmation('') }} className="rounded-xl border border-zinc-900 bg-black/25 p-4 text-left hover:border-[#caa24c]/30"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold text-white">{formatPhone(number.phoneNumber)}</span><Phone size={14} className="text-[#caa24c]"/></div><p className="mt-2 text-[9px] uppercase tracking-wider text-zinc-600">{[number.locality, number.region].filter(Boolean).join(', ') || 'United States'} · Voice · SMS{number.capabilities.mms ? ' · MMS' : ''}</p></button>)}</div>
      {!searching && available.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-zinc-850 px-4 py-6 text-center text-xs text-zinc-600">Search an area code to see numbers currently available from Twilio.</p>}
    </div>
    {selected && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs font-black text-amber-300">Confirm a real Twilio purchase</p><p className="mt-2 text-[10px] leading-relaxed text-zinc-400">Buying <span className="font-mono text-white">{selected.phoneNumber}</span> immediately adds Twilio’s monthly charge{monthlyPrice !== null ? ` of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)}` : ''}. Type the complete number below to authorize it.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value.trim())} placeholder={selected.phoneNumber} className="mt-3 h-10 w-full rounded-lg border border-amber-500/20 bg-black/50 px-3 font-mono text-xs text-white outline-none"/><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-zinc-800 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-zinc-500">Cancel</button><button type="button" onClick={() => void purchase()} disabled={confirmation !== selected.phoneNumber || workingSid === selected.phoneNumber} className="rounded-lg bg-amber-400 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-black disabled:opacity-35">{workingSid === selected.phoneNumber ? 'Purchasing…' : 'Buy & activate number'}</button></div></div>}
  </div>
}

function formatPhone(value: string) { const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value }
