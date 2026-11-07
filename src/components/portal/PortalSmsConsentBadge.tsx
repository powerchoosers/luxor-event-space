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
  className?: string
  pill?: boolean
  shortUnknownOnMobile?: boolean
  shortOptedInOnMobile?: boolean
}

export function PortalSmsConsentBadge({
  phone,
  initialConsent,
  compact = false,
  className = '',
  pill = false,
  shortUnknownOnMobile = false,
  shortOptedInOnMobile = false,
}: PortalSmsConsentBadgeProps) {
  const [fetchedConsent, setFetchedConsent] = useState<{ phone: string; state: SmsConsentState } | null>(null)
  const consent = initialConsent || (fetchedConsent && fetchedConsent.phone === phone ? fetchedConsent.state : null)
  const loading = Boolean(phone) && !consent

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
              phone,
              state: {
                status: data.status,
                updated_at: data.updated_at ?? null,
                consent_scopes: Array.isArray(data.consent_scopes) ? data.consent_scopes : [],
                consent_request_status: data.consent_request_status ?? null,
              },
            })
          } else {
            setFetchedConsent({ phone, state: { status: 'unknown', consent_request_status: null } })
          }
        })
        .catch(() => {
          if (isMounted) setFetchedConsent({ phone, state: { status: 'unknown', consent_request_status: null } })
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
          setFetchedConsent({ phone, state: customEvent.detail.state })
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
    if (pill) {
      return (
        <span role="status" className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--portal-muted)] ${className}`}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--portal-muted)] motion-safe:animate-pulse" />
          <span>Checking SMS…</span>
        </span>
      )
    }
    return (
      <span role="status" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[color:var(--portal-soft)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--portal-muted)] ${className}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--portal-muted)] motion-safe:animate-pulse" />
        {compact ? 'Checking consent…' : 'Checking SMS consent…'}
      </span>
    )
  }

  const status = consent?.status || 'unknown'

  if (status === 'opted_out') {
    if (pill) {
      return (
        <span
          title="Client sent STOP or opted out of SMS. Manual and automated texts are blocked."
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 ${className}`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>SMS Opted Out</span>
        </span>
      )
    }
    return (
      <span
        title="Client sent STOP or opted out of SMS. Manual and automated texts are blocked."
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-red-500/10 ${
          compact ? 'px-1.5 py-0.5 text-[10px] font-semibold' : 'px-2 py-0.5 text-[10px] font-black uppercase tracking-wider'
        } text-red-600 dark:text-red-400 ${className}`}
      >
        <ShieldAlert size={compact ? 10 : 12} className="shrink-0 text-red-500" />
        <span>{compact ? 'SMS opted out' : 'SMS Opted Out (STOP Keyword)'}</span>
      </span>
    )
  }

  if (status === 'opted_in') {
    if (pill) {
      return (
        <span
          title="Client opted in to Luxor SMS updates."
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 ${className}`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span>SMS Opted In</span>
        </span>
      )
    }
    return (
      <span
        title="Client opted in to Luxor SMS updates."
        aria-label={shortOptedInOnMobile ? 'SMS opted in' : undefined}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-500/10 ${
          compact ? 'px-1.5 py-0.5 text-[10px] font-semibold' : 'px-2 py-0.5 text-[10px] font-black uppercase tracking-wider'
        } text-emerald-700 dark:text-emerald-400 ${shortOptedInOnMobile ? 'max-sm:!gap-0 max-sm:!px-0.5 max-sm:[&>svg]:hidden' : ''} ${className}`}
      >
        <ShieldCheck size={compact ? 10 : 12} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
        {shortOptedInOnMobile ? <><span className="sm:hidden" aria-hidden="true">SMS opted</span><span className="hidden sm:inline" aria-hidden="true">SMS opted in</span></> : <span>{compact ? 'SMS opted in' : 'SMS Opted In'}</span>}
      </span>
    )
  }

  if (consent?.consent_request_status === 'pending') {
    if (pill) {
      return (
        <span
          title="A one-time SMS consent request was sent. Waiting for the client to reply YES."
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-2.5 py-1 text-[11px] font-medium text-[#9e7525] dark:text-[#f1d27a] ${className}`}
        >
          <HelpCircle size={12} className="shrink-0 text-[#caa24c]" />
          <span>SMS Pending</span>
        </span>
      )
    }
    return (
      <span
        title="A one-time SMS consent request was sent. Waiting for the client to reply YES."
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#caa24c]/25 bg-[#caa24c]/10 ${
          compact ? 'px-1.5 py-0.5 text-[10px] font-semibold' : 'px-2 py-0.5 text-[10px] font-black uppercase tracking-wider'
        } text-[#8c6529] dark:text-[#f1d27a] ${className}`}
      >
        <HelpCircle size={compact ? 10 : 12} className="shrink-0" />
        <span>{compact ? 'Consent requested' : 'Consent Requested'}</span>
      </span>
    )
  }

  if (pill) {
    return (
      <span
        title="No explicit opt-in or opt-out recorded yet."
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--portal-muted)] ${className}`}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--portal-muted)]/50" />
        <span>No SMS Consent</span>
      </span>
    )
  }

  return (
    <span
      title="No explicit opt-in or opt-out recorded yet."
      aria-label={shortUnknownOnMobile ? 'No SMS consent recorded' : undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[10px]'
      } font-medium text-[color:var(--portal-muted)] ${className}`}
    >
      <HelpCircle size={compact ? 10 : 12} className="shrink-0 opacity-60" />
      {shortUnknownOnMobile ? <><span className="sm:hidden" aria-hidden="true">No SMS</span><span className="hidden sm:inline" aria-hidden="true">No SMS consent</span></> : <span>{compact ? 'No SMS consent' : 'No SMS Consent'}</span>}
    </span>
  )
}
