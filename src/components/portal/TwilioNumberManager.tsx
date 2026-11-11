'use client'

import {
  Laptop,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
} from '@/lib/icons/phosphor-compat'
import { useCallback, useEffect, useState } from 'react'
import {
  PortalButton,
  PortalCheckbox,
  PortalGhostIconButton,
  PortalModal,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import { formatUsDialInput, toUsE164 } from '@/lib/luxorPhoneClient'
import { useToast } from './ToastProvider'

type AvailableNumber = {
  phoneNumber: string
  friendlyName: string
  locality: string | null
  region: string | null
  postalCode: string | null
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }
  addressRequirements: string
}

type OwnedNumber = {
  sid: string
  phoneNumber: string
  friendlyName: string
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }
  isActive: boolean
  isPublic: boolean
  webhooksConfigured: boolean
}

type RoutingSettings = {
  ring_to_number: string | null
  outbound_mode: 'browser' | 'ring_phone'
  ring_browser: boolean
  ring_phone: boolean
  missed_call_text_enabled: boolean
  missed_call_text_body: string
  inbound_text_reply_enabled: boolean
  inbound_text_reply_body: string
  inbound_text_reply_cooldown_hours: number
}

const inputClass =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/15 disabled:opacity-45'

export function TwilioNumberManager() {
  const { notify } = useToast()
  const [areaCode, setAreaCode] = useState('210')
  const [available, setAvailable] = useState<AvailableNumber[]>([])
  const [owned, setOwned] = useState<OwnedNumber[]>([])
  const [canPurchase, setCanPurchase] = useState(false)
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null)
  const [priceUnit, setPriceUnit] = useState('USD')
  const [searching, setSearching] = useState(false)
  const [loadingOwned, setLoadingOwned] = useState(true)
  const [selected, setSelected] = useState<AvailableNumber | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [workingSid, setWorkingSid] = useState<string | null>(null)
  const [cooldownText, setCooldownText] = useState('12')
  const [routing, setRouting] = useState<RoutingSettings>({
    ring_to_number: null,
    outbound_mode: 'browser',
    ring_browser: true,
    ring_phone: false,
    missed_call_text_enabled: false,
    missed_call_text_body:
      'Luxor Event Space: Sorry we missed your call. Reply with your name, event date, and event type, and we will get back to you. Reply STOP to opt out.',
    inbound_text_reply_enabled: false,
    inbound_text_reply_body:
      'Luxor Event Space: Thanks for your message. We received it and will respond as soon as possible. Reply STOP to opt out.',
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
      setCanPurchase(Boolean(data.canPurchase))
    } catch (error) {
      notify({
        title: 'Twilio numbers unavailable',
        description: error instanceof Error ? error.message : 'Unable to load numbers.',
        variant: 'error',
      })
    } finally {
      setLoadingOwned(false)
    }
  }, [notify])

  useEffect(() => {
    void loadOwned()
  }, [loadOwned])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/twilio/phone-settings', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load call routing.')
        setRouting({
          ...data,
          ring_to_number: data.ring_to_number ? formatUsDialInput(data.ring_to_number) : null,
        })
        setCooldownText(String(data.inbound_text_reply_cooldown_hours ?? 12))
      } catch (error) {
        notify({
          title: 'Call routing unavailable',
          description: error instanceof Error ? error.message : 'Unable to load settings.',
          variant: 'error',
        })
      } finally {
        setLoadingRouting(false)
      }
    })()
  }, [notify])

  async function saveRouting() {
    setSavingRouting(true)
    const ringToNumber = toUsE164(routing.ring_to_number || '') || null
    const parsedCooldown = Number(cooldownText)
    const cooldownHours = Number.isFinite(parsedCooldown)
      ? Math.max(1, Math.min(168, Math.round(parsedCooldown)))
      : routing.inbound_text_reply_cooldown_hours || 12

    try {
      const response = await fetch('/api/twilio/phone-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ringToNumber,
          outboundMode: routing.outbound_mode,
          ringBrowser: routing.ring_browser,
          ringPhone: routing.ring_phone,
          missedCallTextEnabled: routing.missed_call_text_enabled,
          missedCallTextBody: routing.missed_call_text_body,
          inboundTextReplyEnabled: routing.inbound_text_reply_enabled,
          inboundTextReplyBody: routing.inbound_text_reply_body,
          inboundTextReplyCooldownHours: cooldownHours,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save call routing.')
      setRouting({
        ...data,
        ring_to_number: data.ring_to_number ? formatUsDialInput(data.ring_to_number) : null,
      })
      setCooldownText(String(data.inbound_text_reply_cooldown_hours ?? cooldownHours))
      notify({
        title: 'Phone and text settings saved',
        description: 'Luxor will use these choices for calls and text automations.',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: 'Could not save routing',
        description: error instanceof Error ? error.message : 'Unable to save settings.',
        variant: 'error',
      })
    } finally {
      setSavingRouting(false)
    }
  }

  async function searchNumbers() {
    if (!/^\d{3}$/.test(areaCode)) {
      notify({ title: 'Enter a three-digit area code.', variant: 'error' })
      return
    }
    setSearching(true)
    setAvailable([])
    try {
      const response = await fetch(`/api/twilio/phone-numbers?mode=available&areaCode=${areaCode}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to search Twilio.')
      setAvailable(data.numbers || [])
      setMonthlyPrice(data.monthlyPrice)
      setPriceUnit(data.priceUnit || 'USD')
    } catch (error) {
      notify({
        title: 'Number search failed',
        description: error instanceof Error ? error.message : 'Unable to search.',
        variant: 'error',
      })
    } finally {
      setSearching(false)
    }
  }

  async function purchase() {
    if (!selected) return
    setWorkingSid(selected.phoneNumber)
    try {
      const response = await fetch('/api/twilio/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase',
          phoneNumber: selected.phoneNumber,
          confirmation,
          monthlyPrice,
          priceUnit,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Twilio could not purchase that number.')
      notify({
        title: 'Luxor number purchased and activated',
        description: `${selected.friendlyName} is configured for calls and texts.`,
        variant: 'success',
      })
      setSelected(null)
      setConfirmation('')
      setAvailable((current) => current.filter((number) => number.phoneNumber !== selected.phoneNumber))
      await loadOwned()
    } catch (error) {
      notify({
        title: 'Purchase failed',
        description: error instanceof Error ? error.message : 'Unable to purchase number.',
        variant: 'error',
      })
    } finally {
      setWorkingSid(null)
    }
  }

  async function activate(number: OwnedNumber) {
    setWorkingSid(number.sid)
    try {
      const response = await fetch('/api/twilio/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', sid: number.sid }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to activate number.')
      notify({
        title: 'Active Luxor number changed',
        description: `${number.phoneNumber} now handles outgoing calls and texts.`,
        variant: 'success',
      })
      await loadOwned()
    } catch (error) {
      notify({
        title: 'Activation failed',
        description: error instanceof Error ? error.message : 'Unable to activate number.',
        variant: 'error',
      })
    } finally {
      setWorkingSid(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Call Routing & Text Automations */}
      <div className="space-y-5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Call routing &amp; text replies</h4>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              Choose how calls connect and whether missed calls or incoming texts send an automatic reply.
            </p>
          </div>
          <Smartphone size={18} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
        </div>

        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Your mobile or office phone number</span>
            <PortalSkeletonTransition
              loading={loadingRouting}
              overlap
              skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
            >
              <input
                type="tel"
                value={routing.ring_to_number || ''}
                onChange={(event) =>
                  setRouting((current) => ({ ...current, ring_to_number: formatUsDialInput(event.target.value) }))
                }
                placeholder="+1 (210) 555-0123"
                inputMode="tel"
                autoComplete="tel"
                className={`${inputClass} font-mono tabular-nums`}
              />
            </PortalSkeletonTransition>
            <span className="block text-xs text-[color:var(--portal-muted)]">
              Used to forward calls when your browser is closed or when you choose to answer on your phone first.
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[color:var(--portal-muted)]">When you click Call</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={loadingRouting}
                onClick={() => setRouting((current) => ({ ...current, outbound_mode: 'browser' }))}
                className={`rounded-xl border p-3.5 text-left transition-colors ${
                  !loadingRouting && routing.outbound_mode === 'browser'
                    ? 'border-[#caa24c]/50 bg-[#caa24c]/10'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/30'
                }`}
              >
                <Laptop
                  size={16}
                  className={!loadingRouting && routing.outbound_mode === 'browser' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}
                />
                <p className="mt-2 text-xs font-bold text-[color:var(--portal-text)]">Use browser microphone</p>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Call directly from this computer.</p>
              </button>
              <button
                type="button"
                disabled={loadingRouting}
                onClick={() => setRouting((current) => ({ ...current, outbound_mode: 'ring_phone' }))}
                className={`rounded-xl border p-3.5 text-left transition-colors ${
                  !loadingRouting && routing.outbound_mode === 'ring_phone'
                    ? 'border-[#caa24c]/50 bg-[#caa24c]/10'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/30'
                }`}
              >
                <Smartphone
                  size={16}
                  className={!loadingRouting && routing.outbound_mode === 'ring_phone' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}
                />
                <p className="mt-2 text-xs font-bold text-[color:var(--portal-text)]">Ring my phone first</p>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Answer your phone, then connect to the guest.</p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[color:var(--portal-muted)]">Incoming business calls</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
                <PortalSkeletonTransition
                  loading={loadingRouting}
                  overlap
                  skeleton={<PortalSkeleton className="h-9 w-full rounded-lg" />}
                >
                  <PortalCheckbox
                    checked={routing.ring_browser}
                    onChange={(checked) => setRouting((current) => ({ ...current, ring_browser: checked }))}
                    label="Ring the browser"
                    sublabel="When the portal is open and phone is active."
                  />
                </PortalSkeletonTransition>
              </div>
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
                <PortalSkeletonTransition
                  loading={loadingRouting}
                  overlap
                  skeleton={<PortalSkeleton className="h-9 w-full rounded-lg" />}
                >
                  <PortalCheckbox
                    checked={routing.ring_phone}
                    onChange={(checked) => setRouting((current) => ({ ...current, ring_phone: checked }))}
                    label="Ring my real phone"
                    sublabel="Works even when the portal is closed."
                  />
                </PortalSkeletonTransition>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-[color:var(--portal-border)] pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-bold text-[color:var(--portal-text)]">Automated text replies</h5>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                  Opt-in auto-replies are saved to message history and honor STOP opt-outs.
                </p>
              </div>
              <MessageSquare size={16} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
            </div>

            <div className="space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
              <PortalSkeletonTransition
                loading={loadingRouting}
                overlap
                skeleton={<PortalSkeleton className="h-8 w-52 rounded-lg" />}
              >
                <PortalCheckbox
                  checked={routing.missed_call_text_enabled}
                  onChange={(checked) => setRouting((current) => ({ ...current, missed_call_text_enabled: checked }))}
                  label="Text after a missed call"
                  sublabel="Sent once when nobody answers."
                />
              </PortalSkeletonTransition>
              <PortalSkeletonTransition
                loading={loadingRouting}
                overlap
                skeleton={<PortalSkeleton className="mt-2 h-20 w-full rounded-xl" />}
              >
                <textarea
                  value={routing.missed_call_text_body}
                  onChange={(event) =>
                    setRouting((current) => ({ ...current, missed_call_text_body: event.target.value.slice(0, 480) }))
                  }
                  rows={3}
                  disabled={!routing.missed_call_text_enabled}
                  className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/15 disabled:opacity-45"
                />
              </PortalSkeletonTransition>
              <p className="text-right text-[11px] tabular-nums text-[color:var(--portal-muted)]">
                {routing.missed_call_text_body.length}/480
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
              <PortalSkeletonTransition
                loading={loadingRouting}
                overlap
                skeleton={<PortalSkeleton className="h-8 w-56 rounded-lg" />}
              >
                <PortalCheckbox
                  checked={routing.inbound_text_reply_enabled}
                  onChange={(checked) => setRouting((current) => ({ ...current, inbound_text_reply_enabled: checked }))}
                  label="Acknowledge incoming texts"
                  sublabel="Confirms receipt once per guest during the cooldown window."
                />
              </PortalSkeletonTransition>
              <PortalSkeletonTransition
                loading={loadingRouting}
                overlap
                skeleton={<PortalSkeleton className="mt-2 h-20 w-full rounded-xl" />}
              >
                <textarea
                  value={routing.inbound_text_reply_body}
                  onChange={(event) =>
                    setRouting((current) => ({ ...current, inbound_text_reply_body: event.target.value.slice(0, 480) }))
                  }
                  rows={3}
                  disabled={!routing.inbound_text_reply_enabled}
                  className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/15 disabled:opacity-45"
                />
              </PortalSkeletonTransition>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-[color:var(--portal-muted)]">Do not repeat to the same person for</span>
                <div className="flex items-center gap-2">
                  <PortalSkeletonTransition
                    loading={loadingRouting}
                    overlap
                    skeleton={<PortalSkeleton className="h-9 w-20 rounded-xl" />}
                  >
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={cooldownText}
                      onChange={(event) => {
                        setCooldownText(event.target.value)
                        const parsed = Number(event.target.value)
                        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 168) {
                          setRouting((current) => ({ ...current, inbound_text_reply_cooldown_hours: Math.round(parsed) }))
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(cooldownText)
                        const clamped = Number.isFinite(parsed) ? Math.max(1, Math.min(168, Math.round(parsed))) : 12
                        setCooldownText(String(clamped))
                        setRouting((current) => ({ ...current, inbound_text_reply_cooldown_hours: clamped }))
                      }}
                      disabled={!routing.inbound_text_reply_enabled}
                      className="min-h-9 w-20 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 text-center font-mono text-xs tabular-nums text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 disabled:opacity-45"
                    />
                  </PortalSkeletonTransition>
                  <span className="text-xs text-[color:var(--portal-muted)]">hours</span>
                </div>
              </div>
            </div>

            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200/85">
              Keep Luxor&apos;s name and &ldquo;Reply STOP to opt out&rdquo; in first-contact auto-replies. Replies stop automatically after STOP until START is received.
            </p>
          </div>

          <div className="flex justify-end">
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void saveRouting()}
              disabled={savingRouting || loadingRouting}
              className="w-full sm:w-auto"
            >
              {savingRouting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
              {savingRouting ? 'Saving…' : 'Save phone & text settings'}
            </PortalButton>
          </div>
        </div>
      </div>

      {/* Purchase Access Notice */}
      <div
        className={`rounded-xl border p-4 ${
          canPurchase
            ? 'border-[#caa24c]/25 bg-[#caa24c]/5'
            : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50'
        }`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            size={18}
            className={`mt-0.5 shrink-0 ${canPurchase ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <PortalSkeletonTransition
              loading={loadingOwned && owned.length === 0}
              overlap
              skeleton={
                <div className="space-y-1.5">
                  <PortalSkeleton className="h-4 w-44 rounded" />
                  <PortalSkeleton className="h-3.5 w-72 max-w-full rounded" />
                </div>
              }
            >
              <div>
                <p className="text-xs font-bold text-[color:var(--portal-text)]">
                  {canPurchase ? 'Owner purchase access enabled' : 'Number purchasing restricted'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--portal-muted)]">
                  {canPurchase
                    ? 'Twilio charges monthly fees immediately upon purchase. Confirmation requires typing the full number.'
                    : 'Only the primary owner account can search for or purchase new Twilio numbers.'}
                </p>
              </div>
            </PortalSkeletonTransition>
          </div>
        </div>
      </div>

      {/* Owned Numbers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Owned numbers</h4>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              The active number handles outgoing browser calls and texts.
            </p>
          </div>
          <PortalGhostIconButton onClick={() => void loadOwned()} aria-label="Refresh owned Twilio numbers" title="Refresh numbers">
            <RefreshCw size={15} className={loadingOwned ? 'animate-spin' : ''} />
          </PortalGhostIconButton>
        </div>

        <PortalSkeletonTransition
          loading={loadingOwned && owned.length === 0}
          skeleton={
            <div className="space-y-2.5">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 py-3"
                >
                  <div className="space-y-1.5">
                    <PortalSkeleton className="h-4 w-36 rounded" />
                    <PortalSkeleton className="h-3 w-44 rounded" />
                  </div>
                  <PortalSkeleton className="h-6 w-20 rounded-md" />
                </div>
              ))}
            </div>
          }
        >
          <div className="space-y-2.5">
            {owned.length > 0 && !owned.some((number) => number.isActive) ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                Choose &ldquo;Use for CRM&rdquo; on the number Luxor should use for outgoing calls and texts.
              </p>
            ) : null}

            {owned.map((number) => (
              <div
                key={number.sid}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold tabular-nums text-[color:var(--portal-text)]">
                    {formatPhone(number.phoneNumber)}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                    {[
                      number.capabilities.voice ? 'Voice' : null,
                      number.capabilities.sms ? 'SMS' : null,
                      number.capabilities.mms ? 'MMS' : null,
                      number.webhooksConfigured ? 'Webhooks ready' : 'Needs configuration',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {number.isPublic ? <PortalStatusBadge borderless tone="gold" status="Website" /> : null}
                  {number.isActive ? (
                    <PortalStatusBadge borderless tone="green" status="CRM active" />
                  ) : (
                    <PortalButton
                      size="sm"
                      variant="secondary"
                      disabled={workingSid === number.sid}
                      onClick={() => void activate(number)}
                    >
                      {workingSid === number.sid ? 'Activating…' : 'Use for CRM'}
                    </PortalButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PortalSkeletonTransition>
      </div>

      {/* Find a New Number */}
      {canPurchase ? (
        <div className="space-y-3 border-t border-[color:var(--portal-border)] pt-5">
          <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Find a new local number</h4>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <MapPin
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]"
                aria-hidden="true"
              />
              <input
                value={areaCode}
                onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="3-digit area code (e.g. 210)"
                inputMode="numeric"
                className="min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] pl-9 pr-3.5 text-sm tabular-nums text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/15"
              />
            </div>
            <PortalButton
              type="button"
              variant="primary"
              onClick={() => void searchNumbers()}
              disabled={searching || areaCode.length !== 3}
              className="w-full shrink-0 sm:w-auto"
            >
              {searching ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
              Search
            </PortalButton>
          </div>

          {monthlyPrice !== null ? (
            <p className="text-xs tabular-nums text-[color:var(--portal-muted)]">
              Twilio monthly number price: {new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)}/month, plus usage fees.
            </p>
          ) : null}

          {available.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {available.map((number) => (
                <button
                  key={number.phoneNumber}
                  type="button"
                  onClick={() => {
                    setSelected(number)
                    setConfirmation('')
                  }}
                  className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 text-left transition-colors hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold tabular-nums text-[color:var(--portal-text)]">
                      {formatPhone(number.phoneNumber)}
                    </span>
                    <Phone size={14} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                  </div>
                  <p className="mt-1.5 text-xs text-[color:var(--portal-muted)]">
                    {[number.locality, number.region].filter(Boolean).join(', ') || 'United States'} · Voice · SMS
                    {number.capabilities.mms ? ' · MMS' : ''}
                  </p>
                </button>
              ))}
            </div>
          ) : !searching ? (
            <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-6 text-center text-xs text-[color:var(--portal-muted)]">
              Search an area code to view available Twilio numbers.
            </p>
          ) : null}
        </div>
      ) : null}

      <PortalModal
        isOpen={Boolean(canPurchase && selected)}
        onClose={() => {
          if (!workingSid) {
            setSelected(null)
            setConfirmation('')
          }
        }}
        title="Confirm Twilio number purchase"
        description="Twilio bills the monthly rate immediately once purchased."
        maxWidth="max-w-md"
      >
        {selected ? (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">
              Buying <span className="font-mono font-semibold text-[color:var(--portal-text)]">{selected.phoneNumber}</span> adds Twilio&apos;s monthly charge
              {monthlyPrice !== null
                ? ` of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: priceUnit }).format(monthlyPrice)}`
                : ''}
              . Type the full number below to confirm.
            </p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value.trim())}
              placeholder={selected.phoneNumber}
              className={inputClass + ' font-mono'}
            />
            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-3 sm:flex-row sm:justify-end">
              <PortalButton
                variant="ghost"
                disabled={Boolean(workingSid)}
                onClick={() => {
                  setSelected(null)
                  setConfirmation('')
                }}
              >
                Cancel
              </PortalButton>
              <PortalButton
                variant="primary"
                onClick={() => void purchase()}
                disabled={confirmation !== selected.phoneNumber || workingSid === selected.phoneNumber}
              >
                {workingSid === selected.phoneNumber ? 'Purchasing…' : 'Buy & activate number'}
              </PortalButton>
            </div>
          </div>
        ) : null}
      </PortalModal>
    </div>
  )
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}
