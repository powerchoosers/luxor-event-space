'use client'

import { BellOff, BellRing, Check, Loader2, Send, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/portal/ToastProvider'

type PushType = 'email' | 'booking'
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
  const [types, setTypes] = useState<PushType[]>(['email', 'booking'])

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
      notify({ title: 'Install Luxor Portal first', description: 'In Safari, tap Share → Add to Home Screen, then open the new Luxor Portal icon.', variant: 'info' })
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
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      await saveSubscription(subscription, types)
      setState('enabled')
      notify({ title: 'iPhone notifications enabled', description: 'Luxor alerts can now arrive when the portal is closed.', variant: 'success' })
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

  const sendTest = async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/portal/push-subscriptions/test', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not send a test notification.')
      if (!payload.sent) throw new Error('No active device subscription was found.')
      notify({ title: 'Test notification sent', variant: 'success' })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Could not send a test notification.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const statusCopy: Record<PushState, string> = {
    loading: 'Checking this device…',
    unsupported: 'This browser does not support Web Push notifications.',
    'install-required': 'Install Luxor Portal on the Home Screen before enabling iPhone notifications.',
    unconfigured: 'Web Push keys must be configured on the server before notifications can be enabled.',
    denied: 'Notifications are blocked in iPhone Settings. Allow them for Luxor Portal, then return here.',
    disabled: 'Notifications are available but turned off on this device.',
    enabled: 'Notifications are active on this device—even when the portal is closed.',
    error: 'Notification status could not be verified. Try again.',
  }

  return (
    <section className="luxor-glass-card space-y-5 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 xl:col-span-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#9b6d24] dark:text-[#f1d27a]">
            {state === 'enabled' ? <BellRing size={18} /> : <Smartphone size={18} />}
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">iPhone App Notifications</h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[color:var(--portal-muted)]">{statusCopy[state]}</p>
          </div>
        </div>
        <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${state === 'enabled' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
          {state === 'enabled' ? 'Active' : state === 'loading' ? 'Checking' : 'Not active'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { type: 'email' as const, title: 'New emails', copy: 'Alert when a new message reaches the Luxor inbox.' },
          { type: 'booking' as const, title: 'Inquiries & bookings', copy: 'Alert for new inquiries and newly created event bookings.' },
        ]).map((option) => {
          const selected = types.includes(option.type)
          return (
            <button key={option.type} type="button" onClick={() => void toggleType(option.type)} disabled={busy || state === 'unconfigured'} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-[#caa24c]/40 bg-[#caa24c]/8' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-transparent'}`}><Check size={13} /></span>
              <span><span className="block text-xs font-bold text-[color:var(--portal-text)]">{option.title}</span><span className="mt-1 block text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{option.copy}</span></span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--portal-border)] pt-4">
        {state === 'enabled' ? (
          <>
            <button type="button" onClick={() => void sendTest()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#b58e39] disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
            </button>
            <button type="button" onClick={() => void disableNotifications()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-bold text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] disabled:opacity-50">
              <BellOff size={14} /> Disable on this device
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void enableNotifications()} disabled={busy || ['loading', 'unsupported', 'unconfigured', 'denied'].includes(state)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#b58e39] disabled:cursor-not-allowed disabled:opacity-45">
            {busy || state === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />} {state === 'install-required' ? 'How to install' : 'Enable notifications'}
          </button>
        )}
        <p className="text-[9px] leading-relaxed text-[color:var(--portal-faint)]">Notification previews avoid client names and private event details.</p>
      </div>
    </section>
  )
}
