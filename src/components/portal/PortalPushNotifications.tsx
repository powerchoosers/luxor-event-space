'use client'

import { BellOff, BellRing, Check, Loader2, Smartphone } from '@/lib/icons/phosphor-compat'
import { useCallback, useEffect, useState } from 'react'
import {
  PortalButton,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type PushType = 'email' | 'booking' | 'call'
type PushState = 'loading' | 'unsupported' | 'install-required' | 'unconfigured' | 'denied' | 'disabled' | 'enabled' | 'error'

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function isStandaloneWebApp() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

function isIosDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function PortalPushNotifications() {
  const { notify } = useToast()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [types, setTypes] = useState<PushType[]>(['email', 'booking', 'call'])

  const loadState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState(isIosDevice() && !isStandaloneWebApp() ? 'install-required' : 'unsupported')
      return
    }
    if (isIosDevice() && !isStandaloneWebApp()) {
      setState('install-required')
      return
    }

    try {
      const response = await fetch('/api/portal/push-subscriptions', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      const config = await response.json()
      if (!response.ok) throw new Error(config.error || 'Could not load notification settings.')
      if (!config.configured || !config.publicKey) {
        setState('unconfigured')
        return
      }
      setPublicKey(config.publicKey)

      const registration = await navigator.serviceWorker.register('/luxor-portal-sw.js', { scope: '/portal/' })
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) setState('enabled')
      else if (Notification.permission === 'denied') setState('denied')
      else setState('disabled')
    } catch (error) {
      console.error('Failed to initialize Luxor Web Push:', error)
      setState('error')
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadState(), 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadState])

  const saveSubscription = async (subscription: PushSubscription, notificationTypes: PushType[]) => {
    const response = await fetch('/api/portal/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), notificationTypes }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Could not save notification settings.')
  }

  const enableNotifications = async () => {
    if (state === 'install-required') {
      notify({
        title: 'Install Luxor Portal first',
        description: 'In Safari, tap Share → Add to Home Screen, then open the Luxor Portal icon.',
        variant: 'info',
      })
      return
    }

    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'disabled')
        return
      }
      const registration = await navigator.serviceWorker.register('/luxor-portal-sw.js', { scope: '/portal/' })
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      await saveSubscription(subscription, types)
      setState('enabled')
      notify({
        title: 'Notifications enabled',
        description: 'Luxor alerts can now arrive when the portal is closed.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to enable Luxor Web Push:', error)
      setState('error')
      notify({ title: error instanceof Error ? error.message : 'Could not enable notifications.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const disableNotifications = async () => {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration('/portal/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const response = await fetch('/api/portal/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Could not disable notifications.')
        }
        await subscription.unsubscribe()
      }
      setState('disabled')
      notify({ title: 'Notifications disabled on this device', variant: 'success' })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Could not disable notifications.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const toggleType = async (type: PushType) => {
    const next = types.includes(type) ? types.filter((item) => item !== type) : [...types, type]
    if (next.length === 0) return
    setTypes(next)

    if (state === 'enabled') {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/portal/')
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) await saveSubscription(subscription, next)
      } catch (error) {
        setTypes(types)
        notify({ title: error instanceof Error ? error.message : 'Could not update notification types.', variant: 'error' })
      }
    }
  }

  const statusCopy: Record<PushState, string> = {
    loading: 'Checking this device…',
    unsupported: 'This browser does not support push alerts.',
    'install-required': 'Add Luxor Portal to your iPhone Home Screen to turn on push alerts.',
    unconfigured: 'Push alerts are not configured on this server yet.',
    denied: 'Alerts are blocked in your browser or iPhone Settings.',
    disabled: 'Ready to turn on for this device.',
    enabled: 'Active on this device, even when the portal is closed.',
    error: 'Could not check alert status. Try again.',
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
            {state === 'enabled' ? <BellRing size={18} /> : <Smartphone size={18} />}
          </div>
          <div>
            <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Device notifications</h3>
            <PortalSkeletonTransition
              loading={state === 'loading'}
              overlap
              skeleton={<PortalSkeleton className="mt-1.5 h-4 w-44 rounded-md" />}
            >
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{statusCopy[state]}</p>
            </PortalSkeletonTransition>
          </div>
        </div>
        <div className="shrink-0">
          <PortalSkeletonTransition
            loading={state === 'loading'}
            overlap
            skeleton={<PortalSkeleton className="h-5 w-16 rounded-md" />}
          >
            <PortalStatusBadge
              status={state === 'enabled' ? 'Active' : 'Not active'}
              tone={state === 'enabled' ? 'green' : 'neutral'}
              borderless
            />
          </PortalSkeletonTransition>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { type: 'email' as const, title: 'New emails', copy: 'When a guest message arrives.' },
            { type: 'booking' as const, title: 'Inquiries & bookings', copy: 'New leads and booked events.' },
            { type: 'call' as const, title: 'Incoming calls', copy: 'Caller name and quick answer.' },
          ] as const
        ).map((option) => {
          const selected = types.includes(option.type)
          return (
            <button
              key={option.type}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => void toggleType(option.type)}
              disabled={busy || state === 'unconfigured'}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-[#caa24c]/45 bg-[#caa24c]/8'
                  : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/30'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                  selected
                    ? 'border-[#caa24c] bg-[#caa24c]'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-transparent'
                }`}
              >
                {selected ? (
                  <Check size={12} strokeWidth={3} style={{ color: '#ffffff', stroke: '#ffffff' }} />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[color:var(--portal-text)]">{option.title}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">{option.copy}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[color:var(--portal-muted)]">
          Lock-screen previews omit private guest details.
        </p>
        {state === 'enabled' ? (
          <PortalButton
            type="button"
            variant="secondary"
            onClick={() => void disableNotifications()}
            disabled={busy}
            className="w-full shrink-0 sm:w-auto"
          >
            <BellOff size={14} />
            Disable on this device
          </PortalButton>
        ) : (
          <PortalButton
            type="button"
            variant="primary"
            onClick={() => void enableNotifications()}
            disabled={busy || ['loading', 'unsupported', 'unconfigured', 'denied'].includes(state)}
            className="w-full shrink-0 sm:w-auto"
          >
            {busy || state === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
            {state === 'install-required' ? 'How to install' : 'Enable notifications'}
          </PortalButton>
        )}
      </div>
    </section>
  )
}
