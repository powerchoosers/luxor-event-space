'use client'

import React, { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react'

export type SmsConsentState = {
  status: 'opted_in' | 'opted_out' | 'unknown'
  updated_at?: string | null
  consent_scopes?: string[]
}

interface PortalSmsConsentBadgeProps {
  phone?: string | null
  initialConsent?: SmsConsentState | null
  compact?: boolean
  showTooltip?: boolean
}

export function PortalSmsConsentBadge({
  phone,
  initialConsent,
  compact = false,
}: PortalSmsConsentBadgeProps) {
  const [consent, setConsent] = useState<SmsConsentState | null>(initialConsent || null)
  const [loading, setLoading] = useState(!initialConsent && Boolean(phone))

  useEffect(() => {
    if (initialConsent) return

    if (!phone) return

    let isMounted = true

    fetch(`/api/twilio/consent?phone=${encodeURIComponent(phone)}`, {
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return
        if (data && typeof data.status === 'string') {
          setConsent({
            status: data.status,
            updated_at: data.updated_at ?? null,
            consent_scopes: Array.isArray(data.consent_scopes) ? data.consent_scopes : [],
          })
        } else {
          setConsent({ status: 'unknown' })
        }
      })
      .catch(() => {
        if (isMounted) setConsent({ status: 'unknown' })
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [phone, initialConsent])

  if (!phone) return null

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[color:var(--portal-soft)] px-2 py-0.5 text-[9px] font-medium text-[color:var(--portal-faint)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--portal-faint)] animate-pulse" />
        Checking SMS Consent...
      </span>
    )
  }

  const status = consent?.status || 'unknown'

  if (status === 'opted_out') {
    return (
      <span
        title="Client sent STOP or opted out of SMS. Manual and automated texts are blocked."
        className={`inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 ${
          compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'
        } font-black uppercase tracking-wider text-red-500 dark:text-red-400`}
      >
        <ShieldAlert size={compact ? 10 : 12} className="shrink-0 text-red-500" />
        <span>SMS Opted Out (STOP Keyword)</span>
      </span>
    )
  }

  if (status === 'opted_in') {
    return (
      <span
        title="Client opted in to Luxor SMS updates."
        className={`inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 ${
          compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'
        } font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400`}
      >
        <ShieldCheck size={compact ? 10 : 12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>SMS Opted In</span>
      </span>
    )
  }

  return (
    <span
      title="No explicit opt-in or opt-out recorded yet."
      className={`inline-flex items-center gap-1 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] ${
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'
      } font-medium text-[color:var(--portal-muted)]`}
    >
      <HelpCircle size={compact ? 10 : 12} className="shrink-0 opacity-60" />
      <span>No SMS Consent Recorded</span>
    </span>
  )
}
