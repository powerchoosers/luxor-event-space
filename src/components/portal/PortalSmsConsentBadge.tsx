'use client'

import React, { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react'

export type SmsConsentState = {
  status: 'opted_in' | 'opted_out' | 'unknown'
  updated_at?: string | null
  consent_scopes?: string[]
  consent_request_status?: 'pending' | 'failed' | 'confirmed' | null
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
  const [fetchedConsent, setFetchedConsent] = useState<SmsConsentState | null>(null)
  const consent = initialConsent || fetchedConsent
  const [loading, setLoading] = useState(!initialConsent && Boolean(phone))

  useEffect(() => {
    if (!phone) return

    let isMounted = true

    const fetchConsent = () => {
      fetch(`/api/twilio/consent?phone=${encodeURIComponent(phone)}`, {
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return
          if (data && typeof data.status === 'string') {
            setFetchedConsent({
              status: data.status,
              updated_at: data.updated_at ?? null,
              consent_scopes: Array.isArray(data.consent_scopes) ? data.consent_scopes : [],
              consent_request_status: data.consent_request_status ?? null,
            })
          } else {
            setFetchedConsent({ status: 'unknown', consent_request_status: null })
          }
        })
        .catch(() => {
          if (isMounted) setFetchedConsent({ status: 'unknown', consent_request_status: null })
        })
        .finally(() => {
          if (isMounted) setLoading(false)
        })
    }

    if (!initialConsent) {
      fetchConsent()
    }

    const handleConsentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ phone?: string; state?: SmsConsentState }>
      const updatedPhone = customEvent.detail?.phone
      if (!updatedPhone || updatedPhone === phone || updatedPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        if (customEvent.detail?.state) {
          setFetchedConsent(customEvent.detail.state)
        } else {
          fetchConsent()
        }
      }
    }

    window.addEventListener('luxor-sms-consent-updated', handleConsentUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('luxor-sms-consent-updated', handleConsentUpdated)
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

  if (consent?.consent_request_status === 'pending') {
    return (
      <span
        title="A one-time SMS consent request was sent. Waiting for the client to reply YES."
        className={`inline-flex items-center gap-1 rounded-md border border-[#caa24c]/25 bg-[#caa24c]/10 ${
          compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'
        } font-black uppercase tracking-wider text-[#8c6529] dark:text-[#f1d27a]`}
      >
        <HelpCircle size={compact ? 10 : 12} className="shrink-0" />
        <span>Consent Requested</span>
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
      <span>No SMS Consent</span>
    </span>
  )
}
