'use client'

import { Check, Loader2, QrCode, WalletCards } from '@/lib/icons/phosphor-compat'
import { useCallback, useEffect, useState } from 'react'
import { PortalButton, PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type PaymentSettings = {
  zelle_recipient: string | null
  zelle_qr_code_url: string | null
}

const INPUT_CLASS =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

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
      const payload = (await response.json().catch(() => ({}))) as PaymentSettings & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not load payment settings.')
      setRecipient(payload.zelle_recipient || '')
      setQrCodeUrl(payload.zelle_qr_code_url || '')
    } catch (error) {
      notify({
        title: 'Payment settings unavailable',
        description: error instanceof Error ? error.message : 'Could not load payment settings.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/portal/payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zelleRecipient: recipient, zelleQrCodeUrl: qrCodeUrl }),
      })
      const payload = (await response.json().catch(() => ({}))) as PaymentSettings & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not save payment settings.')
      setRecipient(payload.zelle_recipient || '')
      setQrCodeUrl(payload.zelle_qr_code_url || '')
      notify({
        title: 'Zelle payment details saved',
        description: 'Clients see these details only after signing their agreement.',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: 'Payment settings not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
          <WalletCards size={17} />
        </span>
        <div>
          <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">In-person payment</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            Zelle details revealed to clients after they sign their agreement.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Zelle recipient</span>
          <PortalSkeletonTransition
            loading={loading}
            overlap
            skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
          >
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              maxLength={160}
              placeholder="Email, phone, or business name"
              className={INPUT_CLASS}
            />
          </PortalSkeletonTransition>
        </label>

        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--portal-muted)]">
            <QrCode size={13} />
            Zelle QR image URL (optional)
          </span>
          <PortalSkeletonTransition
            loading={loading}
            overlap
            skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
          >
            <input
              value={qrCodeUrl}
              onChange={(event) => setQrCodeUrl(event.target.value)}
              inputMode="url"
              placeholder="https://…"
              className={INPUT_CLASS}
            />
          </PortalSkeletonTransition>
        </label>

        <div className="flex justify-end pt-1">
          <PortalButton
            type="button"
            variant="primary"
            onClick={() => void save()}
            disabled={loading || saving}
            className="w-full sm:w-auto"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save Zelle details'}
          </PortalButton>
        </div>
      </div>
    </section>
  )
}
