'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { PortalButton } from './PortalUI'
import type { LuxorMailSettings } from '@/lib/luxorMailSettings'

export function MailProviderSettings() {
  const [settings, setSettings] = useState<LuxorMailSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [zohoSetup, setZohoSetup] = useState<{ webhookUrl: string; initialized: boolean } | null>(null)
  const [zohoLoading, setZohoLoading] = useState(false)
  const [zohoError, setZohoError] = useState('')
  const [copied, setCopied] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const zohoRequestRef = useRef<AbortController | null>(null)

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
    return () => { requestRef.current?.abort(); zohoRequestRef.current?.abort() }
  }, [refresh])

  const loadZohoSetup = async () => {
    if (zohoSetup) { setZohoSetup(null); setCopied(''); return }
    zohoRequestRef.current?.abort()
    const controller = new AbortController()
    zohoRequestRef.current = controller
    setZohoLoading(true); setZohoError('')
    try {
      const response = await fetch('/api/portal/zoho-webhook-config', { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      if (!response.ok || typeof payload.webhookUrl !== 'string') throw new Error('Unavailable')
      if (!controller.signal.aborted) setZohoSetup({ webhookUrl: payload.webhookUrl, initialized: payload.initialized === true })
    } catch {
      if (!controller.signal.aborted) setZohoError('Zoho setup could not be loaded. Try again without changing mail providers.')
    } finally { if (!controller.signal.aborted) setZohoLoading(false) }
  }

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
          <SettingRow title="Zoho mail credentials" value={settings.zoho.credentialsPresent ? 'Present — credentials not verified' : 'Incomplete'} />
          <SettingRow title="Zoho calendar SMTP" value={settings.zoho.calendarCredentialsPresent ? 'Credentials present — delivery not verified' : 'Incomplete'} />
          <SettingRow title="Portal sign-in" value="Zoho OAuth — replacement login and recovery still required" />
        </dl>
        <div className="space-y-2 text-xs text-[color:var(--portal-muted)]">
          <p>Checked {new Date(settings.checkedAt).toLocaleString()} · this deployment only</p>
          <p className="font-semibold text-[color:var(--portal-text)]">Resend webhook endpoint</p>
          <p className="break-all select-text">{settings.resend.webhookUrl}</p>
          <PortalButton variant="secondary" onClick={() => void copy(settings.resend.webhookUrl, 'Resend endpoint')}>Copy Resend endpoint</PortalButton>
          <p>Saved activity does not prove incoming mail routing, domain verification, or RSVP behavior. Keep Zoho available until the migration checks are complete.</p>
        </div>
      </> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--portal-border)] pt-4">
        <PortalButton variant="secondary" onClick={() => void loadZohoSetup()} disabled={zohoLoading} aria-expanded={Boolean(zohoSetup)} aria-controls="zoho-mail-setup">
          {zohoLoading ? 'Loading Zoho setup…' : zohoSetup ? 'Hide Zoho setup' : 'Show Zoho setup'}
        </PortalButton>
        <a href="/api/auth/zoho/login?setup=1" className="text-xs font-semibold text-[color:var(--portal-text)] underline underline-offset-4">Reconnect Zoho</a>
      </div>
      {zohoError ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{zohoError}</p> : null}
      {zohoSetup ? <div id="zoho-mail-setup" className="space-y-3 text-xs leading-relaxed text-[color:var(--portal-muted)]">
        <p>{zohoSetup.initialized ? 'Zoho signing secret saved. This is not a live delivery check.' : 'Awaiting Zoho webhook initialization.'}</p>
        <p className="break-all select-text">{zohoSetup.webhookUrl}</p>
        <PortalButton variant="secondary" onClick={() => void copy(zohoSetup.webhookUrl, 'Zoho webhook URL')}>Copy Zoho webhook URL</PortalButton>
        <ol className="list-decimal space-y-2 pl-5">
          <li>In Zoho Mail, open Settings → Integrations → Developer Space → Outgoing Webhooks.</li>
          <li>Add a Mail webhook, paste the secure URL, and choose incoming mail.</li>
          <li>Enable Limited Data List so Zoho sends sender, recipient, subject, and time—not the body.</li>
          <li>Save it. The first signed request records the signing secret.</li>
        </ol>
      </div> : null}
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
