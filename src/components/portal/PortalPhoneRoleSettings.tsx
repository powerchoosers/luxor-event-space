'use client'

import { Check, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PortalSelect } from './PortalUI'
import { useToast } from './ToastProvider'

type OwnedNumber = {
  sid: string
  phoneNumber: string
  isActive: boolean
  isPublic: boolean
  webhooksConfigured: boolean
}

type Props = {
  mode: 'venue' | 'profile'
}

export function PortalPhoneRoleSettings({ mode }: Props) {
  const { notify } = useToast()
  const [numbers, setNumbers] = useState<OwnedNumber[]>([])
  const [canPurchase, setCanPurchase] = useState(false)
  const [selectedSid, setSelectedSid] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/twilio/phone-numbers?mode=owned', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not load Luxor phone numbers.')
      const nextNumbers = Array.isArray(payload.numbers) ? payload.numbers : []
      setNumbers(nextNumbers)
      setCanPurchase(Boolean(payload.canPurchase))
      setSelectedSid(nextNumbers.find((number: OwnedNumber) => number.isPublic)?.sid || '')
    } catch (error) {
      notify({ title: 'Phone settings unavailable', description: error instanceof Error ? error.message : 'Could not load Luxor phone numbers.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void load() }, [load])

  const activeNumber = useMemo(() => numbers.find((number) => number.isActive), [numbers])
  const publicNumber = useMemo(() => numbers.find((number) => number.isPublic), [numbers])

  async function savePublicNumber() {
    if (!selectedSid || selectedSid === publicNumber?.sid) return
    setSaving(true)
    try {
      const response = await fetch('/api/twilio/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_public', sid: selectedSid }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not update the website number.')
      await load()
      notify({ title: 'Website phone number updated', description: 'Public calls still enter the Luxor CRM before following the saved ring settings.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Website number not changed', description: error instanceof Error ? error.message : 'Could not update the website number.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex min-h-28 items-center justify-center text-xs text-[color:var(--portal-muted)]"><Loader2 size={15} className="mr-2 animate-spin" /> Loading phone assignment</div>

  if (mode === 'profile') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">CRM calling line</p>
              <p className="mt-1.5 font-mono text-sm font-bold text-[color:var(--portal-text)]">{activeNumber ? formatPhone(activeNumber.phoneNumber) : 'No active number selected'}</p>
            </div>
            <Phone size={18} className="text-[#a8792f]" />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">This is the number shown on Arianna&apos;s team profile and used for outgoing CRM calls and texts.</p>
        </div>
        <div className={`rounded-xl border p-4 ${canPurchase ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'}`}>
          <div className="flex gap-3">
            <ShieldCheck size={17} className={canPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-[color:var(--portal-faint)]'} />
            <div>
              <p className="text-xs font-bold text-[color:var(--portal-text)]">{canPurchase ? 'Number purchasing enabled' : 'Number purchasing restricted'}</p>
              <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">Only Arianna&apos;s approved owner login can search for and buy new Twilio numbers. This permission is checked by the server.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Website Phone Line</h3>
        <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">This number stays on the public website even when the active CRM calling number changes.</p>
      </div>
      <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 p-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Currently published</p>
        <p className="mt-1.5 font-mono text-lg font-bold text-[color:var(--portal-text)]">{publicNumber ? formatPhone(publicNumber.phoneNumber) : 'Not selected'}</p>
        <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">Incoming calls use Luxor&apos;s CRM webhook, call history, and saved browser/phone ring settings.</p>
      </div>
      {numbers.length > 0 ? (
        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Choose website number</label>
          <PortalSelect value={selectedSid} options={numbers.map((number) => ({ value: number.sid, label: `${formatPhone(number.phoneNumber)}${number.isActive ? ' — CRM active' : ''}` }))} onChange={setSelectedSid} />
          <button type="button" onClick={() => void savePublicNumber()} disabled={!selectedSid || selectedSid === publicNumber?.sid || saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#b8903f] disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Updating website' : 'Use on public website'}
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-4 text-[10px] leading-4 text-[color:var(--portal-muted)]">No owned Twilio numbers are available yet. Arianna can add one from Integrations.</p>
      )}
    </div>
  )
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}
