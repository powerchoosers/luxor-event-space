'use client'

import { Check, Loader2, Phone, ShieldCheck } from '@/lib/icons/phosphor-compat'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PortalButton,
  PortalSelect,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

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
      notify({
        title: 'Phone settings unavailable',
        description: error instanceof Error ? error.message : 'Could not load Luxor phone numbers.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

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
      notify({
        title: 'Website phone number updated',
        description: 'Incoming calls still route through Luxor call history and ring settings.',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: 'Website number not changed',
        description: error instanceof Error ? error.message : 'Could not update the website number.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'profile') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">CRM calling line</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Number used for your outgoing CRM calls and texts.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[color:var(--portal-muted)]">Active line</p>
              <PortalSkeletonTransition
                loading={loading}
                overlap
                skeleton={<PortalSkeleton className="mt-1.5 h-5 w-36 rounded-md" />}
              >
                <p className="mt-1 truncate font-sans text-sm font-bold tabular-nums text-[color:var(--portal-text)]">
                  {activeNumber ? formatPhone(activeNumber.phoneNumber) : 'No active line'}
                </p>
              </PortalSkeletonTransition>
            </div>
            <Phone size={18} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <ShieldCheck
              size={18}
              className={`mt-0.5 shrink-0 ${!loading && canPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-[color:var(--portal-muted)]'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">Number purchasing</p>
                <PortalSkeletonTransition
                  loading={loading}
                  overlap
                  skeleton={<PortalSkeleton className="h-5 w-16 rounded-md" />}
                >
                  <PortalStatusBadge
                    status={canPurchase ? 'Enabled' : 'Owner only'}
                    tone={canPurchase ? 'green' : 'neutral'}
                    borderless
                  />
                </PortalSkeletonTransition>
              </div>
              <PortalSkeletonTransition
                loading={loading}
                overlap
                skeleton={<PortalSkeleton className="mt-1.5 h-4 w-48 rounded-md" />}
              >
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  {canPurchase ? 'Your owner login can search and add numbers.' : 'Only the owner account can add new numbers.'}
                </p>
              </PortalSkeletonTransition>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Website phone line</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Number displayed on the public Luxor website.</p>
        </div>
        <PortalSkeletonTransition
          loading={loading}
          overlap
          skeleton={<PortalSkeleton className="h-5 w-14 rounded-md" />}
        >
          <PortalStatusBadge
            status={publicNumber ? 'Active' : 'Not set'}
            tone={publicNumber ? 'green' : 'neutral'}
            borderless
          />
        </PortalSkeletonTransition>
      </div>

      <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
        <p className="text-xs font-medium text-[color:var(--portal-muted)]">Published website number</p>
        <PortalSkeletonTransition
          loading={loading}
          overlap
          skeleton={<PortalSkeleton className="mt-1.5 h-6 w-40 rounded-md" />}
        >
          <p className="mt-1 font-sans text-lg font-bold tabular-nums text-[color:var(--portal-text)]">
            {publicNumber ? formatPhone(publicNumber.phoneNumber) : 'Not selected'}
          </p>
        </PortalSkeletonTransition>
      </div>

      <PortalSkeletonTransition
        loading={loading}
        overlap
        skeleton={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">
                Choose website number
              </span>
              <PortalSkeleton className="h-11 w-full rounded-xl sm:h-9" />
            </div>
            <PortalButton type="button" variant="primary" disabled className="w-full sm:w-auto">
              <Check size={14} />
              Use on website
            </PortalButton>
          </div>
        }
      >
        {numbers.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="block text-xs font-medium text-[color:var(--portal-muted)]">
                Choose website number
              </label>
              <PortalSelect
                value={selectedSid}
                options={numbers.map((number) => ({
                  value: number.sid,
                  label: `${formatPhone(number.phoneNumber)}${number.isActive ? ' (CRM active)' : ''}`,
                }))}
                onChange={setSelectedSid}
                aria-label="Choose website number"
              />
            </div>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void savePublicNumber()}
              disabled={!selectedSid || selectedSid === publicNumber?.sid || saving}
              className="w-full sm:w-auto"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Updating…' : 'Use on website'}
            </PortalButton>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-4 text-xs text-[color:var(--portal-muted)]">
            No Twilio numbers available yet. Add a number in Email &amp; connections.
          </p>
        )}
      </PortalSkeletonTransition>
    </div>
  )
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}
