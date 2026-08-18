'use client'

import { Check, Loader2, QrCode, WalletCards } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from './ToastProvider'

type PaymentSettings = {
  zelle_recipient: string | null
  zelle_qr_code_url: string | null
}

export function PortalPaymentSettings() {
  const { notify } = useToast()
  const [recipient, setRecipient] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/portal/payment-settings', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as PaymentSettings & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not load payment settings.')
      setRecipient(payload.zelle_recipient || '')
      setQrCodeUrl(payload.zelle_qr_code_url || '')
    } catch (error) {
      notify({ title: 'Payment settings unavailable', description: error instanceof Error ? error.message : 'Could not load payment settings.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/portal/payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zelleRecipient: recipient, zelleQrCodeUrl: qrCodeUrl }),
      })
      const payload = await response.json().catch(() => ({})) as PaymentSettings & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not save payment settings.')
      setRecipient(payload.zelle_recipient || '')
      setQrCodeUrl(payload.zelle_qr_code_url || '')
      notify({ title: 'Zelle payment details saved', description: 'Clients see these details only after they have signed their agreement.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Payment settings not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex min-h-40 items-center justify-center text-xs text-[color:var(--portal-muted)]"><Loader2 size={15} className="mr-2 animate-spin" /> Loading payment details</div>

  return (
    <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]"><WalletCards size={17} /></span>
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">In-person payment</h3>
          <p className="mt-1.5 text-xs leading-5 text-[color:var(--portal-muted)]">Give clients the Zelle details they need after signing, without storing them inside an individual proposal.</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Zelle recipient</span>
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={160} placeholder="Business email, phone, or recipient name" className="mt-2 h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/12" />
          <span className="mt-1.5 block text-[10px] leading-4 text-[color:var(--portal-muted)]">Shown only to a client who has completed the secure agreement step.</span>
        </label>
        <label className="block">
          <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]"><QrCode size={13} /> Zelle QR image URL</span>
          <input value={qrCodeUrl} onChange={(event) => setQrCodeUrl(event.target.value)} inputMode="url" placeholder="https://…" className="mt-2 h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/12" />
          <span className="mt-1.5 block text-[10px] leading-4 text-[color:var(--portal-muted)]">Optional. Paste a secure image URL for the QR code the client can scan with their phone.</span>
        </label>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-[#dfbd68] disabled:cursor-wait disabled:opacity-45">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Saving payment details' : 'Save Zelle details'}
        </button>
      </div>
    </section>
  )
}
