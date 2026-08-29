'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { PortalButton } from './PortalUI'
import type { LuxorMailSettings } from '@/lib/luxorMailSettings'

export function MailProviderSettings() {
  const [settings, setSettings] = useState<LuxorMailSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true); setError(''); setSettings(null)
    try {
      const response = await fetch('/api/portal/mail-settings', { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error('Unavailable')
      if (!controller.signal.aborted) setSettings(payload)
    } catch {
      if (!controller.signal.aborted) setError('Email settings are unavailable. Please try again.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { requestRef.current?.abort() }
  }, [refresh])

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label + ' copied.') }
    catch { setCopied('Copy was unavailable. Select and copy the displayed address.') }
  }

  return (
    <section className="luxor-glass-card min-w-0 space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6" aria-label="Email delivery settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Email delivery</h3>
        <PortalButton variant="secondary" onClick={() => void refresh()} disabled={loading} aria-label="Refresh email delivery settings">
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Refresh
        </PortalButton>
      </div>
      <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">Read-only status for this deployment. Refreshing does not send email, verify DNS, or switch providers.</p>
      {loading ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading email settings…</p> : null}
      {error ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{error}</p> : null}
      {settings ? <>
        <dl className="divide-y divide-[color:var(--portal-border)] text-xs">
          <SettingRow title="Ordinary email" value={(settings.activeProvider === 'resend' ? 'Resend' : 'Zoho Mail') + ' · ' + settings.fromAddress} />
          <SettingRow title="Resend API key" value={settings.resend.apiKeyPresent ? 'Present — credentials not verified' : 'Not configured'} />
          <SettingRow title="Resend webhook signing secret" value={settings.resend.webhookSecretPresent ? 'Present — endpoint not verified' : 'Not configured'} />
          <SettingRow title="Latest saved Resend webhook" value={!settings.resend.activityAvailable ? 'Activity could not be checked' : settings.resend.lastWebhookAt
            ? new Date(settings.resend.lastWebhookAt).toLocaleString() + (settings.resend.lastWebhookProcessedAt ? ' · processed' : ' · awaiting processing') : 'No event recorded'} />
          <SettingRow title="Legacy Zoho archive" value={settings.zoho.credentialsPresent ? 'Retained temporarily for the protected history archive' : 'Not configured'} />
          <SettingRow title="Portal sign-in" value="Luxor email and password" />
        </dl>
        <div className="space-y-2 text-xs text-[color:var(--portal-muted)]">
          <p>Checked {new Date(settings.checkedAt).toLocaleString()} · this deployment only</p>
          <p className="font-semibold text-[color:var(--portal-text)]">Resend webhook endpoint</p>
          <p className="break-all select-text">{settings.resend.webhookUrl}</p>
          <PortalButton variant="secondary" onClick={() => void copy(settings.resend.webhookUrl, 'Resend endpoint')}>Copy Resend endpoint</PortalButton>
          <p>Saved activity does not prove incoming mail routing, domain verification, or RSVP behavior. The former Zoho connection is retained only while its history archive remains unfinished.</p>
        </div>
      </> : null}
      <p role="status" className="text-xs text-[color:var(--portal-muted)]">{copied}</p>
    </section>
  )
}

function SettingRow({ title, value }: { title: string; value: string }) {
  return <div className="space-y-1 py-3">
    <dt className="font-semibold text-[color:var(--portal-text)]">{title}</dt>
    <dd className="break-words leading-relaxed text-[color:var(--portal-muted)]">{value}</dd>
  </div>
}
