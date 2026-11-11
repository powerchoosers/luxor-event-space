'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Loader2, Phone, RefreshCw } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalSelect, PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'

type InboundSettings = { voice: 'brise' | 'nira'; ariannaAvailable: boolean }
type RoutingStatus = { status: 'planned' | 'active' | 'unverified'; detail?: string }

function parseRouting(value: unknown): RoutingStatus {
  if (!value || typeof value !== 'object') return { status: 'unverified' }
  const routing = value as Record<string, unknown>
  const status = ['planned', 'active', 'unverified'].includes(String(routing.status))
    ? routing.status as RoutingStatus['status'] : 'unverified'
  return { status, detail: typeof routing.detail === 'string' ? routing.detail : undefined }
}

function parseSettings(value: unknown): InboundSettings {
  if (!value || typeof value !== 'object') throw new Error('The saved call settings are incomplete.')
  const settings = value as Record<string, unknown>
  if (!['brise', 'nira'].includes(String(settings.voice)) || typeof settings.ariannaAvailable !== 'boolean') {
    throw new Error('The saved call settings are incomplete.')
  }
  return { voice: settings.voice as InboundSettings['voice'], ariannaAvailable: settings.ariannaAvailable }
}

/** Saved inbound policy, deliberately separate from audition/test-line controls. */
export function ElenaInboundSettings() {
  const [settings, setSettings] = useState<InboundSettings | null>(null)
  const [routing, setRouting] = useState<RoutingStatus>({ status: 'unverified' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'voice' | 'availability' | null>(null)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const mounted = useRef(true)
  const request = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = request.current = new AbortController()
    setLoading(true)
    setError('')
    setSavedMessage('')
    try {
      const response = await fetch('/api/portal/elena-inbound-settings', {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      })
      if (!response.ok) throw new Error('Call settings could not load. Reload to check the saved values.')
      const payload = await response.json()
      const result = parseSettings(payload)
      if (mounted.current && request.current === controller) {
        setSettings(result)
        setRouting(parseRouting(payload.routing))
      }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || request.current !== controller) return
      setSettings(null)
      setError(error instanceof Error ? error.message : 'Call settings could not load.')
    } finally {
      if (mounted.current && request.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false; request.current?.abort() }
  }, [load])

  const save = async (patch: Partial<InboundSettings>, field: 'voice' | 'availability') => {
    if (!settings || saving) return
    request.current?.abort()
    const controller = request.current = new AbortController()
    setSaving(field)
    setError('')
    setSavedMessage('')
    try {
      const response = await fetch('/api/portal/elena-inbound-settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      })
      if (!response.ok) throw new Error('The change could not be confirmed. Reload to check the saved settings.')
      const payload = await response.json()
      const result = parseSettings(payload)
      if (!mounted.current || request.current !== controller) return
      setSettings(result)
      if (payload.routing !== undefined) setRouting(parseRouting(payload.routing))
      setSavedMessage(field === 'voice'
        ? `${result.voice === 'brise' ? 'Brise' : 'Nira'} saved for incoming calls.`
        : result.ariannaAvailable ? 'Saved: Arianna is available for transfers.' : 'Saved: Arianna is unavailable for transfers.')
    } catch {
      if (!mounted.current || controller.signal.aborted || request.current !== controller) return
      // A timed-out write may still have reached the server. Read it back before another change.
      setSettings(null)
      setError('The change could not be confirmed. Reload to check the saved settings.')
    } finally {
      if (mounted.current && request.current === controller) setSaving(null)
    }
  }

  return <section aria-labelledby="elena-inbound-heading" aria-busy={loading || Boolean(saving)} className="min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <Phone size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#caa24c]" />
        <div className="min-w-0"><h3 id="elena-inbound-heading" className="text-base font-bold text-[color:var(--portal-text)]">Incoming calls</h3><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Elena’s voice and Arianna’s availability.</p></div>
      </div>
      <Link href="/portal/elena-voice" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Listen in sandbox<ChevronRight size={14} aria-hidden="true" /></Link>
    </div>

    <PortalSkeletonTransition loading={loading} skeleton={<div className="space-y-5 p-4 sm:p-5"><div className="space-y-2"><PortalSkeleton className="h-4 w-32 rounded" /><PortalSkeleton className="h-11 w-full max-w-xs rounded-xl" /></div><div className="flex items-center justify-between gap-4 border-t border-[color:var(--portal-border)] pt-5"><div className="space-y-2"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-3.5 w-60 max-w-full rounded" /></div><PortalSkeleton className="h-6 w-10 shrink-0 rounded-full" /></div></div>}>
      <div className="space-y-5 p-4 sm:p-5">
        {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm leading-6 text-[color:var(--portal-text)]"><p className="max-w-xl">{error}</p><PortalButton className="min-h-11" onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Reload settings</PortalButton></div> : null}
        {settings ? <>
          <div className="grid gap-5 lg:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1.35fr)]">
          <div className="max-w-xs">
            <p className="mb-2 text-sm font-semibold text-[color:var(--portal-text)]">Elena’s phone voice</p>
            <PortalSelect aria-label="Elena’s incoming call voice" value={settings.voice} onChange={(voice) => { if (voice !== settings.voice) void save({ voice: voice as InboundSettings['voice'] }, 'voice') }} options={[{ value: 'brise', label: 'Brise' }, { value: 'nira', label: 'Nira' }]} disabled={Boolean(saving)} buttonClassName="!min-h-11" />
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-[color:var(--portal-border)] pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="min-w-0"><p id="arianna-availability-label" className="text-sm font-semibold text-[color:var(--portal-text)]">Arianna can take transfers</p><div id="arianna-availability-help" className="mt-1 max-w-xl space-y-1 text-xs leading-5 text-[color:var(--portal-muted)]"><p>{routing.status === 'active' ? 'Elena answers first.' : 'When the Elena-first flow is enabled, Elena answers first.'} When a caller asks for Arianna:</p><p>Available: Elena saves their name and phone before trying a live transfer.</p><p>Unavailable: Elena collects their name, phone, email, and best callback time.</p></div><p className="mt-2 text-xs font-semibold text-[color:var(--portal-text)]">{settings.ariannaAvailable ? 'Available' : 'Unavailable'}</p></div>
            <button type="button" role="switch" aria-labelledby="arianna-availability-label" aria-describedby="arianna-availability-help" aria-checked={settings.ariannaAvailable} disabled={Boolean(saving)} onClick={() => void save({ ariannaAvailable: !settings.ariannaAvailable }, 'availability')} className="-mr-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50">
              <span aria-hidden="true" className={`relative block h-6 w-10 overflow-hidden rounded-full transition-colors duration-200 motion-reduce:transition-none ${settings.ariannaAvailable ? 'bg-[#a8792f] dark:bg-[#caa24c]' : 'bg-[color:var(--portal-muted)]'}`}><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200 motion-reduce:transition-none ${settings.ariannaAvailable ? 'translate-x-4' : 'translate-x-0'}`} /></span>
            </button>
          </div>
          </div>

          {saving ? <p role="status" className="flex items-center gap-2 text-xs leading-5 text-[color:var(--portal-muted)]"><Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Saving {saving === 'voice' ? 'voice' : 'availability'}…</p> : savedMessage ? <p role="status" className="flex items-start gap-2 text-xs leading-5 text-[color:var(--portal-text)]"><Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{savedMessage}</p> : null}
        </> : null}
        <div className="space-y-1 text-xs leading-5 text-[color:var(--portal-muted)]">
          <p>{routing.detail || (routing.status === 'active'
            ? 'Elena is answering incoming Luxor calls first.'
            : routing.status === 'planned'
              ? 'These settings are prepared for the Elena-first phone flow. Public-line routing has not been activated.'
              : 'Public-line routing could not be verified. This screen does not confirm that Elena is answering calls.')}</p>
          <p>{routing.status === 'active' ? 'Changes save immediately. A new voice starts with the next call; an active call keeps its voice.' : 'Changes save immediately. Saving these settings does not activate public-line routing.'} The test-line voice is separate.</p>
        </div>
      </div>
    </PortalSkeletonTransition>
  </section>
}
