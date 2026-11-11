'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Loader2, RefreshCw } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalSkeleton, PortalSkeletonTransition, PortalStatusBadge } from './PortalUI'
import type { LuxorMailSettings } from '@/lib/luxorMailSettings'

export function MailProviderSettings() {
  const [settings, setSettings] = useState<LuxorMailSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/portal/mail-settings', { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error('Unavailable')
      if (!controller.signal.aborted) setSettings(payload)
    } catch {
      if (!controller.signal.aborted) setError('Email settings are unavailable. Please try again.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      requestRef.current?.abort()
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [refresh])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyMessage('Resend endpoint copied.')
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyMessage('Copy was unavailable. Select and copy the displayed address.')
    }
  }

  const isFetchingInitial = loading && !settings
  const providerLabel = settings?.activeProvider === 'resend' ? 'Resend' : 'Zoho Mail'
  const isResendReady = Boolean(settings?.resend.apiKeyPresent && settings?.resend.webhookSecretPresent)

  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"
      aria-label="Email delivery settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-[color:var(--portal-text)]">Email delivery</h3>
            <PortalSkeletonTransition
              loading={isFetchingInitial}
              overlap
              className="inline-flex items-center"
              skeleton={<PortalSkeleton className="h-5 w-24 rounded-md" />}
            >
              {settings ? (
                <PortalStatusBadge
                  borderless
                  tone={isResendReady ? 'green' : 'gold'}
                  status={isResendReady ? `${providerLabel} active` : `${providerLabel} partial`}
                />
              ) : null}
            </PortalSkeletonTransition>
          </div>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            Active sending provider and address for guest and client emails.
          </p>
        </div>
        <PortalButton
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh email delivery settings"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
          Refresh
        </PortalButton>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <dl className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 text-xs">
        <SettingRow
          title="Active provider"
          loading={isFetchingInitial}
          skeletonWidth="w-48"
          value={settings ? `${providerLabel} · ${settings.fromAddress}` : 'Unavailable'}
        />
        <SettingRow title="Portal sign-in" value="Luxor email and password" />
        <SettingRow
          title="Latest webhook activity"
          loading={isFetchingInitial}
          skeletonWidth="w-40"
          value={
            !settings
              ? 'Unavailable'
              : !settings.resend.activityAvailable
                ? 'Could not be checked'
                : settings.resend.lastWebhookAt
                  ? `${new Date(settings.resend.lastWebhookAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · ${settings.resend.lastWebhookProcessedAt ? 'processed' : 'awaiting processing'}`
                  : 'No event recorded yet'
          }
        />
      </dl>

      <details className="group rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-[color:var(--portal-text)]">
          <span>Technical details</span>
          <ChevronDown size={15} className="shrink-0 text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-[color:var(--portal-border)] px-4 py-4 text-xs">
          <dl className="divide-y divide-[color:var(--portal-border)]">
            <SettingRow
              title="Resend API key"
              loading={isFetchingInitial}
              skeletonWidth="w-24"
              value={settings?.resend.apiKeyPresent ? 'Configured' : 'Not configured'}
            />
            <SettingRow
              title="Webhook signing secret"
              loading={isFetchingInitial}
              skeletonWidth="w-24"
              value={settings?.resend.webhookSecretPresent ? 'Configured' : 'Not configured'}
            />
            <SettingRow
              title="Legacy Zoho archive"
              loading={isFetchingInitial}
              skeletonWidth="w-44"
              value={settings?.zoho.credentialsPresent ? 'Retained for mail history import' : 'Not configured'}
            />
            <SettingRow
              title="Last checked"
              loading={isFetchingInitial}
              skeletonWidth="w-36"
              value={
                settings
                  ? new Date(settings.checkedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Unavailable'
              }
            />
          </dl>

          <div className="space-y-2 border-t border-[color:var(--portal-border)] pt-3">
            <p className="font-semibold text-[color:var(--portal-text)]">Resend webhook endpoint</p>
            <PortalSkeletonTransition
              loading={isFetchingInitial}
              overlap
              skeleton={<PortalSkeleton className="h-9 w-full rounded-lg" />}
            >
              {settings ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[11px] text-[color:var(--portal-muted)] select-all">
                    {settings.resend.webhookUrl}
                  </code>
                  <PortalButton
                    variant="secondary"
                    size="sm"
                    onClick={() => void copy(settings.resend.webhookUrl)}
                    className="shrink-0"
                  >
                    {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy endpoint'}
                  </PortalButton>
                </div>
              ) : (
                <p className="text-xs text-[color:var(--portal-muted)]">Webhook URL unavailable.</p>
              )}
            </PortalSkeletonTransition>
            {copyMessage ? (
              <p role="status" className="text-[11px] text-[color:var(--portal-muted)]">{copyMessage}</p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  )
}

function SettingRow({
  title,
  value,
  loading = false,
  skeletonWidth = 'w-32',
}: {
  title: string
  value: string
  loading?: boolean
  skeletonWidth?: string
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="shrink-0 font-medium text-[color:var(--portal-muted)]">{title}</dt>
      <dd className="min-w-0 sm:text-right">
        <PortalSkeletonTransition
          loading={loading}
          overlap
          className="inline-flex min-w-0 items-center sm:justify-end"
          skeleton={<PortalSkeleton className={`h-4 ${skeletonWidth} rounded`} />}
        >
          <span className="break-words font-semibold tabular-nums text-[color:var(--portal-text)]">{value}</span>
        </PortalSkeletonTransition>
      </dd>
    </div>
  )
}
