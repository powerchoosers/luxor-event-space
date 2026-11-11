'use client'

import { Call, Device } from '@twilio/voice-sdk'
import {
  BellRing,
  Delete,
  Grid,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  X,
} from '@/lib/icons/phosphor-compat'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '@/components/portal/ToastProvider'
import { PortalContactAvatar, PortalCloseButton } from '@/components/portal/PortalUI'
import { formatPhoneDisplay, formatUsDialInput, removeLastDialDigit, toUsE164 } from '@/lib/luxorPhoneClient'

type PhoneState = 'disabled' | 'starting' | 'ready' | 'error'
class BrowserPhoneAuthorizationError extends Error {}
type CallPhase = 'dialing' | 'ringing' | 'active'

type DialTarget = {
  phoneNumber: string
  contactName?: string | null
  inquiryId?: string | null
}

type ActiveCall = {
  mode: 'browser' | 'ring_phone'
  direction: 'inbound' | 'outbound'
  phoneNumber: string
  contactName: string
  inquiryId: string | null
  twilioCallSid: string | null
  phase: CallPhase
  startedAt: number
  ringToNumber?: string | null
  bridgeStage?: 'calling_phone' | 'connecting_client' | 'connected'
  bridgeStatusUnavailable?: boolean
}

type IncomingCall = ActiveCall & { call: Call }

type DialMatch = {
  id: string
  fullName: string
  eventType: string | null
  phoneNumber: string | null
}

type VoiceContextValue = {
  canViewLeadDetails: boolean
  canText: boolean
  canEmail: boolean
  phoneState: PhoneState
  callQuality: 'good' | 'medium' | 'bad'
  unreadCount: number
  isPanelOpen: boolean
  activeCall: ActiveCall | null
  isStartingCall: boolean
  startingCallTarget: DialTarget | null
  isMuted: boolean
  setCallQuality: (quality: 'good' | 'medium' | 'bad') => void
  openPanel: () => void
  closePanel: () => void
  enablePhone: () => Promise<void>
  startCall: (target: DialTarget) => Promise<void>
  hangUp: () => void
  toggleMute: () => void
  sendDigit: (digit: string) => void
  dismissBridgeNotice: () => void
  minimizeCall: () => void
  openCallView: (options?: { showKeypad?: boolean }) => void
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function PortalVoiceProvider({ children, canUsePhone, canViewLeadDetails, canText, canEmail }: { children: React.ReactNode; canUsePhone: boolean; canViewLeadDetails: boolean; canText: boolean; canEmail: boolean }) {
  const { notify } = useToast()
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  const callReturnPathRef = useRef('/portal')
  const [phoneState, setPhoneState] = useState<PhoneState>('starting')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [isStartingCall, setIsStartingCall] = useState(false)
  const [startingCallTarget, setStartingCallTarget] = useState<DialTarget | null>(null)
  const [callQuality, setCallQuality] = useState<'good' | 'medium' | 'bad'>('good')
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [dialNumber, setDialNumber] = useState('')
  const [dialMatch, setDialMatch] = useState<DialMatch | null>(null)
  const [isLookingUpNumber, setIsLookingUpNumber] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadCountRequestRef = useRef<Promise<void> | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const currentCallRef = useRef<Call | null>(null)
  const initializingRef = useRef<Promise<Device> | null>(null)
  const generationRef = useRef(0)
  const recoverRef = useRef<(() => void) | null>(null)
  const clearAuthBlockRef = useRef<(() => void) | null>(null)
  const tokenNeedsRefreshRef = useRef(false)
  const suppressRecoveryRef = useRef(false)
  const callStartingRef = useRef(false)

  useEffect(() => { routerRef.current = router }, [router])

  const openCallView = useCallback((options?: { showKeypad?: boolean }) => {
    const { pathname: currentPath, search, hash } = window.location
    if (currentPath !== '/portal/calls') callReturnPathRef.current = `${currentPath}${search}${hash}`
    setIsPanelOpen(false)
    const destination = options?.showKeypad ? '/portal/calls?tab=keypad' : '/portal/calls'
    if (currentPath !== '/portal/calls' || (options?.showKeypad && !new URLSearchParams(window.location.search).has('tab'))) {
      routerRef.current.push(destination)
    } else if (options?.showKeypad && new URLSearchParams(window.location.search).get('tab') !== 'keypad') {
      routerRef.current.replace(destination)
    }
  }, [])

  const navigateToMobileCall = useCallback(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return false
    openCallView()
    return true
  }, [openCallView])

  const loadUnreadCount = useCallback(async (skipIfPending = false) => {
    if (skipIfPending && unreadCountRequestRef.current) return

    while (unreadCountRequestRef.current) {
      await unreadCountRequestRef.current
    }

    const request = (async () => {
      try {
        const response = await fetch('/api/twilio/calls?unreadOnly=true&limit=100', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        if (!response.ok) return
        const calls = await response.json() as unknown[]
        setUnreadCount(calls.length)
      } catch {
        // A temporary call-history failure should not take the phone offline.
      }
    })()

    unreadCountRequestRef.current = request
    try {
      await request
    } finally {
      if (unreadCountRequestRef.current === request) unreadCountRequestRef.current = null
    }
  }, [])

  useEffect(() => {
    const normalized = toUsE164(dialNumber)
    if (!normalized) {
      setDialMatch(null)
      setIsLookingUpNumber(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsLookingUpNumber(true)
      try {
        const response = await fetch(`/api/twilio/phone-lookup?phone=${encodeURIComponent(normalized)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({})) as { match?: DialMatch | null }
        if (response.ok) setDialMatch(payload.match ?? null)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setDialMatch(null)
      } finally {
        if (!controller.signal.aborted) setIsLookingUpNumber(false)
      }
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [dialNumber])

  useEffect(() => {
    let active = true
    let catchingUp = false
    void loadUnreadCount()
    const refreshWhenVisible = async () => {
      if (document.visibilityState !== 'visible' || catchingUp) return
      catchingUp = true
      try {
        // A request started before returning may contain an older count.
        if (unreadCountRequestRef.current) await unreadCountRequestRef.current
        if (active && document.visibilityState === 'visible') await loadUnreadCount(true)
      } finally {
        catchingUp = false
      }
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadUnreadCount(true)
    }, 30_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [loadUnreadCount])

  const refreshToken = useCallback(async () => {
    const response = await fetch('/api/twilio/token', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({})) as { token?: string; error?: string }
    if (!response.ok || !payload.token) {
      if (response.status === 401 || response.status === 403) throw new BrowserPhoneAuthorizationError(payload.error || 'Phone access is unavailable for this account.')
      throw new Error(payload.error || 'Unable to authorize the Luxor browser phone.')
    }
    return payload.token
  }, [])

  const clearCall = useCallback(() => {
    currentCallRef.current = null
    setActiveCall(null)
    setIncomingCall(null)
    setIsMuted(false)
    setCallQuality('good')
    window.dispatchEvent(new Event('luxor-call-history-refresh'))
    window.setTimeout(loadUnreadCount, 1000)
  }, [loadUnreadCount])

  const attachCallEvents = useCallback((call: Call, initial: ActiveCall) => {
    currentCallRef.current = call
    setActiveCall(initial)

    call.on('ringing', () => {
      setActiveCall((current) => current ? { ...current, phase: 'ringing' } : current)
    })
    call.on('accept', () => {
      setActiveCall((current) => current ? { ...current, phase: 'active', startedAt: Date.now() } : current)
      setIncomingCall(null)
      if (initial.direction === 'inbound') {
        if (!navigateToMobileCall()) setIsPanelOpen(true)
      } else if (!window.matchMedia('(max-width: 767px)').matches) {
        setIsPanelOpen(true)
      }
    })
    call.on('warning', (name) => {
      const warningName = String(name || '').toLowerCase()
      if (warningName.includes('high-rtt') || warningName.includes('packet-loss') || warningName.includes('audio-loss')) {
        setCallQuality('bad')
      } else {
        setCallQuality('medium')
      }
    })
    call.on('warning-cleared', () => {
      setCallQuality('good')
    })
    call.on('disconnect', clearCall)
    call.on('cancel', clearCall)
    call.on('reject', clearCall)
    call.on('error', (error) => {
      notify({
        title: 'Call error',
        description: error.message || 'The call could not continue.',
        variant: 'error',
      })
      clearCall()
    })
  }, [clearCall, navigateToMobileCall, notify])

  const handleIncomingCall = useCallback((call: Call) => {
    if (window.location.pathname === '/portal/calls') callReturnPathRef.current = '/portal'
    const contactName = call.customParameters.get('CallerName') || 'Unknown caller'
    const phoneNumber = call.customParameters.get('CallerNumber') || call.parameters.From || 'Unknown number'
    const inquiryId = call.customParameters.get('InquiryId') || null
    const parentCallSid = call.customParameters.get('ParentCallSid') || call.parameters.CallSid || null
    const incoming: IncomingCall = {
      call,
      mode: 'browser',
      direction: 'inbound',
      phoneNumber,
      contactName,
      inquiryId,
      twilioCallSid: parentCallSid,
      phase: 'ringing',
      startedAt: Date.now(),
    }

    attachCallEvents(call, incoming)
    setIncomingCall(incoming)
    setIsPanelOpen(false)
    setUnreadCount((count) => count + 1)

    navigator.vibrate?.([180, 90, 180])
  }, [attachCallEvents])

  const initializeDevice = useCallback(async () => {
    if (initializingRef.current) return initializingRef.current
    const generation = generationRef.current
    const isCurrent = () => generationRef.current === generation

    const pending = (async () => {
      setPhoneState('starting')
      setPhoneError(null)
      const existing = deviceRef.current
      if (existing && existing.state !== Device.State.Destroyed) {
        if (existing.state === Device.State.Unregistered) {
          const token = await refreshToken()
          if (!isCurrent()) throw new Error('Phone initialization cancelled.')
          existing.updateToken(token)
          tokenNeedsRefreshRef.current = false
          await existing.register()
        }
        if (existing.state === Device.State.Registered) setPhoneState('ready')
        return existing
      }
      const token = await refreshToken()
      if (!isCurrent()) throw new Error('Phone initialization cancelled.')
      tokenNeedsRefreshRef.current = false
      const device = new Device(token, {
        allowIncomingWhileBusy: false,
        appName: 'Luxor Owner Portal',
        appVersion: '1.0.0',
        closeProtection: 'A Luxor call is active. Leave this page?',
      })

      device.on('registering', () => { if (isCurrent()) setPhoneState('starting') })
      device.on('registered', () => { if (isCurrent()) { setPhoneError(null); setPhoneState('ready') } })
      device.on('unregistered', () => {
        if (!isCurrent() || suppressRecoveryRef.current) return
        setPhoneState('error')
        setPhoneError('Connection lost. Reconnecting the browser phone.')
        recoverRef.current?.()
      })
      device.on('incoming', handleIncomingCall)
      device.on('tokenWillExpire', async () => {
        tokenNeedsRefreshRef.current = true
        if (currentCallRef.current) { recoverRef.current?.(); return }
        try {
          const token = await refreshToken()
          if (isCurrent() && deviceRef.current === device) {
            if (currentCallRef.current) { recoverRef.current?.(); return }
            device.updateToken(token)
            tokenNeedsRefreshRef.current = false
          }
        } catch (error) {
          console.error('Luxor phone token refresh failed:', error)
          if (isCurrent()) recoverRef.current?.()
        }
      })
      device.on('error', (error) => {
        if (!isCurrent()) return
        setPhoneState('error')
        setPhoneError(error.message || 'The browser phone could not connect.')
        recoverRef.current?.()
      })

      deviceRef.current = device
      try {
        await device.register()
        if (!isCurrent()) throw new Error('Phone initialization cancelled.')
        return device
      } catch (error) {
        if (deviceRef.current === device) deviceRef.current = null
        device.destroy()
        throw error
      }
    })()

    initializingRef.current = pending
    try {
      return await pending
    } finally {
      if (initializingRef.current === pending) initializingRef.current = null
    }
  }, [handleIncomingCall, refreshToken])

  const enablePhone = useCallback(async () => {
    try {
      if (!canUsePhone) throw new Error('Your account does not have phone access.')
      await initializeDevice()
      clearAuthBlockRef.current?.()
      if (tokenNeedsRefreshRef.current) recoverRef.current?.()
      notify({
        title: 'Browser phone connected',
        description: 'Keep the portal open and allow microphone access when answering a call.',
        variant: 'success',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enable the browser phone.'
      setPhoneState('error')
      setPhoneError(message)
      notify({ title: 'Phone setup failed', description: message, variant: 'error' })
    }
  }, [canUsePhone, initializeDevice, notify])

  const startCall = useCallback(async (target: DialTarget) => {
    if (!canUsePhone) return
    if (currentCallRef.current || callStartingRef.current || activeCall?.mode === 'ring_phone') {
      notify({ title: 'Call already active', description: 'End the current call before starting another.', variant: 'error' })
      return
    }

    callStartingRef.current = true
    setStartingCallTarget(target)
    setIsStartingCall(true)
    if (window.location.pathname === '/portal/calls') callReturnPathRef.current = '/portal'
    const mobileCall = navigateToMobileCall()
    try {
      const settingsResponse = await fetch('/api/twilio/phone-settings', { cache: 'no-store' })
      const settings = await settingsResponse.json().catch(() => ({})) as { outbound_mode?: 'browser' | 'ring_phone'; ring_to_number?: string | null; error?: string }
      if (!settingsResponse.ok) throw new Error(settings.error || 'Unable to load the Luxor dialing preference.')

      if (settings.outbound_mode === 'ring_phone') {
        const response = await fetch('/api/twilio/calls/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target),
        })
        const payload = await response.json().catch(() => ({})) as { error?: string; ringToNumber?: string; callSid?: string }
        if (!response.ok) throw new Error(payload.error || 'Twilio could not ring your phone.')
        const bridgeCall: ActiveCall = {
          mode: 'ring_phone', direction: 'outbound', phoneNumber: target.phoneNumber,
          contactName: target.contactName || target.phoneNumber, inquiryId: target.inquiryId || null,
          twilioCallSid: payload.callSid || null, phase: 'dialing', startedAt: Date.now(),
          ringToNumber: payload.ringToNumber || settings.ring_to_number || null,
          bridgeStage: 'calling_phone', bridgeStatusUnavailable: !payload.callSid,
        }
        setActiveCall((current) => current?.mode === 'browser' ? current : bridgeCall)
        setIsPanelOpen(false)
        notify({
          title: 'Answer your phone',
          description: `Twilio is ringing ${formatPhoneDisplay(payload.ringToNumber || settings.ring_to_number || 'your saved phone')}. Answer it to connect the customer.`,
          variant: 'success',
        })
        window.dispatchEvent(new Event('luxor-call-history-refresh'))
        return
      }

      const device = await initializeDevice()
      const call = await device.connect({
        params: {
          To: target.phoneNumber,
          ContactName: target.contactName || '',
          InquiryId: target.inquiryId || '',
        },
      })
      const nextCall: ActiveCall = {
        mode: 'browser',
        direction: 'outbound',
        phoneNumber: target.phoneNumber,
        contactName: target.contactName || target.phoneNumber,
        inquiryId: target.inquiryId || null,
        twilioCallSid: null,
        phase: 'dialing',
        startedAt: Date.now(),
      }
      attachCallEvents(call, nextCall)
      if (!mobileCall) setIsPanelOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The call could not be started.'
      notify({ title: 'Unable to call', description: message, variant: 'error' })
    } finally {
      callStartingRef.current = false
      setIsStartingCall(false)
      setStartingCallTarget(null)
    }
  }, [activeCall?.mode, attachCallEvents, canUsePhone, initializeDevice, navigateToMobileCall, notify])

  const bridgeCallSid = activeCall?.mode === 'ring_phone' ? activeCall.twilioCallSid : null
  useEffect(() => {
    if (!bridgeCallSid) return
    let active = true
    let timer: number | undefined
    const controller = new AbortController()
    const terminal = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled'])
    const poll = async () => {
      try {
        const response = await fetch(`/api/twilio/calls/bridge?callSid=${encodeURIComponent(bridgeCallSid)}`, {
          cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw new Error('Unable to check call status.')
        const status = await response.json() as { parentStatus?: string; customerStatus?: string | null }
        if (!active) return
        const parent = status.parentStatus || ''
        const customer = status.customerStatus || ''
        if (terminal.has(parent) || terminal.has(customer)) {
          const result = terminal.has(customer) ? customer : parent
          setActiveCall((call) => call?.mode === 'ring_phone' && call.twilioCallSid === bridgeCallSid ? null : call)
          if (result !== 'completed') notify({ title: 'Phone call ended', description: 'The call did not connect. Check your phone or try again.', variant: 'error' })
          window.dispatchEvent(new Event('luxor-call-history-refresh'))
          return
        }
        const bridgeStage = customer === 'in-progress' ? 'connected' : customer || parent === 'in-progress' ? 'connecting_client' : 'calling_phone'
        const phase = customer === 'in-progress' ? 'active' : customer === 'ringing' ? 'ringing' : 'dialing'
        setActiveCall((call) => call?.mode === 'ring_phone' && call.twilioCallSid === bridgeCallSid
          ? { ...call, bridgeStage, phase, bridgeStatusUnavailable: false } : call)
      } catch {
        if (!active) return
        setActiveCall((call) => call?.mode === 'ring_phone' && call.twilioCallSid === bridgeCallSid
          ? { ...call, bridgeStatusUnavailable: true } : call)
      }
      if (active) timer = window.setTimeout(() => void poll(), 3000)
    }
    void poll()
    return () => { active = false; controller.abort(); if (timer !== undefined) window.clearTimeout(timer) }
  }, [bridgeCallSid, notify])

  useEffect(() => {
    const handleStartCall = (event: Event) => {
      const detail = (event as CustomEvent<DialTarget>).detail
      if (!detail?.phoneNumber) return
      setDialNumber(formatUsDialInput(detail.phoneNumber))
      if (!window.matchMedia('(max-width: 767px)').matches) setIsPanelOpen(true)
      void startCall(detail)
    }
    window.addEventListener('luxor-start-call', handleStartCall)
    return () => window.removeEventListener('luxor-start-call', handleStartCall)
  }, [startCall])

  useEffect(() => {
    if (!canUsePhone) {
      setPhoneState('disabled')
      return
    }
    const generation = ++generationRef.current
    let active = true
    let checking = false
    let blocked = false
    let retryCount = 0
    let timer: number | undefined
    const scheduleRetry = (delay?: number) => {
      if (!active || timer !== undefined) return
      const wait = delay ?? Math.min(60_000, 3000 * 2 ** Math.min(retryCount++, 5))
      timer = window.setTimeout(() => { timer = undefined; void attempt() }, wait)
    }
    const attempt = async () => {
      if (!active || checking || blocked) return
      if (!navigator.onLine) {
        setPhoneState('error')
        setPhoneError('You are offline. The phone will reconnect when your connection returns.')
        scheduleRetry(30_000)
        return
      }
      checking = true
      try {
        const response = await fetch('/api/twilio/phone-settings', { cache: 'no-store' })
        const settings = await response.json().catch(() => ({})) as { ring_browser?: boolean; error?: string }
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new BrowserPhoneAuthorizationError(settings.error || 'Phone access is unavailable for this account.')
          throw new Error(settings.error || 'Unable to load browser phone settings.')
        }
        if (!active) return
        if (settings.ring_browser === false) {
          const device = deviceRef.current
          if (device?.state === Device.State.Registered && !currentCallRef.current) {
            suppressRecoveryRef.current = true
            try { await device.unregister() } finally { suppressRecoveryRef.current = false }
          }
          if (!active) return
          setPhoneState('disabled')
          setPhoneError(null)
          scheduleRetry(currentCallRef.current ? 30_000 : 60_000)
          return
        }
        const device = deviceRef.current
        if (device?.state === Device.State.Registered) {
          if (tokenNeedsRefreshRef.current) {
            // Avoid interrupting an active call when merely resuming the page.
            if (currentCallRef.current) { scheduleRetry(30_000); return }
            const token = await refreshToken()
            if (!active || deviceRef.current !== device) return
            if (currentCallRef.current) { scheduleRetry(30_000); return }
            device.updateToken(token)
            tokenNeedsRefreshRef.current = false
          }
          setPhoneError(null)
          setPhoneState('ready')
        } else {
          await initializeDevice()
        }
        retryCount = 0
      } catch (error) {
        if (!active || generationRef.current !== generation) return
        setPhoneState('error')
        setPhoneError(error instanceof Error ? error.message : 'Unable to connect the browser phone.')
        if (error instanceof BrowserPhoneAuthorizationError) blocked = true
        else scheduleRetry()
      } finally {
        checking = false
      }
    }
    recoverRef.current = () => scheduleRetry()
    clearAuthBlockRef.current = () => { blocked = false; retryCount = 0 }
    void attempt()
    const resume = () => {
      if (document.visibilityState !== 'visible') return
      if (blocked) return
      tokenNeedsRefreshRef.current = true
      if (timer !== undefined) { window.clearTimeout(timer); timer = undefined }
      void attempt()
    }
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      active = false
      generationRef.current = generation + 1
      recoverRef.current = null
      clearAuthBlockRef.current = null
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      initializingRef.current = null
      currentCallRef.current?.disconnect()
      deviceRef.current?.destroy()
      deviceRef.current = null
    }
  }, [canUsePhone, initializeDevice, refreshToken])

  const answerIncoming = useCallback(() => {
    if (!incomingCall) return
    incomingCall.call.accept()
    if (incomingCall.twilioCallSid) {
      void fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twilioCallSid: incomingCall.twilioCallSid, isRead: true }),
      }).then(() => loadUnreadCount())
    }
  }, [incomingCall, loadUnreadCount])

  const rejectIncoming = useCallback(() => {
    if (!incomingCall) return
    incomingCall.call.reject()
    if (incomingCall.twilioCallSid) {
      void fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twilioCallSid: incomingCall.twilioCallSid, isRead: true }),
      }).then(() => loadUnreadCount())
    }
    setIncomingCall(null)
  }, [incomingCall, loadUnreadCount])

  const hangUp = useCallback(() => {
    if (!currentCallRef.current) return
    currentCallRef.current.disconnect()
    clearCall()
  }, [clearCall])

  const toggleMute = useCallback(() => {
    if (!currentCallRef.current) return
    const nextMuted = !isMuted
    currentCallRef.current.mute(nextMuted)
    setIsMuted(nextMuted)
  }, [isMuted])

  const sendDigit = useCallback((digit: string) => {
    if (/^[0-9*#]$/.test(digit)) currentCallRef.current?.sendDigits(digit)
  }, [])

  const dismissBridgeNotice = useCallback(() => {
    setActiveCall((call) => call?.mode === 'ring_phone' ? null : call)
  }, [])

  const minimizeCall = useCallback(() => {
    setIsPanelOpen(false)
    routerRef.current.push(callReturnPathRef.current || '/portal')
  }, [])

  const openPanel = useCallback(() => setIsPanelOpen(true), [])
  const closePanel = useCallback(() => setIsPanelOpen(false), [])

  const contextValue = useMemo<VoiceContextValue>(() => ({
    canViewLeadDetails,
    canText,
    canEmail,
    phoneState,
    callQuality,
    unreadCount,
    isPanelOpen,
    activeCall,
    isStartingCall,
    startingCallTarget,
    isMuted,
    setCallQuality,
    openPanel,
    closePanel,
    enablePhone,
    startCall,
    hangUp,
    toggleMute,
    sendDigit,
    dismissBridgeNotice,
    minimizeCall,
    openCallView,
  }), [activeCall, callQuality, canEmail, canText, canViewLeadDetails, closePanel, dismissBridgeNotice, enablePhone, hangUp, isMuted, isPanelOpen, isStartingCall, minimizeCall, openCallView, openPanel, phoneState, sendDigit, startCall, startingCallTarget, toggleMute, unreadCount])

  return (
    <VoiceContext.Provider value={contextValue}>
      {children}
      <PortalPhonePanel
        activeCall={activeCall?.mode === 'browser' ? activeCall : null}
        dialNumber={dialNumber}
        isMuted={isMuted}
        isOpen={isPanelOpen && !(pathname === '/portal/calls' && (activeCall || isStartingCall))}
        phoneError={phoneError}
        phoneState={phoneState}
        onClose={() => setIsPanelOpen(false)}
        dialMatch={dialMatch}
        isLookingUpNumber={isLookingUpNumber}
        onDial={() => {
          const phoneNumber = toUsE164(dialNumber)
          if (!phoneNumber) return
          void startCall({ phoneNumber, contactName: dialMatch?.fullName, inquiryId: dialMatch?.id })
        }}
        onDialNumberChange={(value) => setDialNumber(formatUsDialInput(value))}
        onEnable={() => void enablePhone()}
        onHangUp={hangUp}
        onSendDigit={sendDigit}
        onToggleMute={toggleMute}
      />
      {incomingCall && typeof document !== 'undefined'
        ? createPortal(
            <IncomingCallOverlay
              call={incomingCall}
              onAnswer={answerIncoming}
              onDecline={rejectIncoming}
            />,
            document.body,
          )
        : null}
    </VoiceContext.Provider>
  )
}

function IncomingCallOverlay({
  call,
  onAnswer,
  onDecline,
}: {
  call: IncomingCall
  onAnswer: () => void
  onDecline: () => void
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[240] flex items-end justify-center bg-[#090806]/92 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-white backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="luxor-incoming-call-title"
    >
      <motion.section
        initial={reduceMotion ? undefined : { y: 28, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="w-full overflow-hidden rounded-[1.75rem] border border-[#caa24c]/30 bg-[#15120e] px-5 pb-6 pt-7 shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:max-w-md sm:px-8 sm:pb-8 sm:pt-9"
      >
        <div className="text-center">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f1d27a]">
            <motion.span
              animate={reduceMotion ? undefined : { opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-emerald-400"
            />
            Incoming Luxor call
          </div>

          <motion.div
            animate={reduceMotion ? undefined : { scale: [1, 1.045, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mt-8 w-fit rounded-full ring-8 ring-[#caa24c]/8"
          >
            <PortalContactAvatar
              name={call.contactName}
              size="xl"
              className="border-[#caa24c]/40 bg-[#caa24c]/15 text-[#f1d27a]"
            />
          </motion.div>

          <h2 id="luxor-incoming-call-title" className="mt-6 text-2xl font-black tracking-tight text-white">
            {call.contactName}
          </h2>
          <p className="mt-2 font-mono text-sm text-white/60">{formatPhoneDisplay(call.phoneNumber)}</p>
          <p className="mt-3 text-xs leading-5 text-white/45">Calling the Luxor business line</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/12 px-4 text-sm font-black text-red-200 transition active:scale-[0.98] hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
            aria-label={`Decline call from ${call.contactName}`}
          >
            <PhoneOff size={21} /> Decline
          </button>
          <button
            type="button"
            onClick={onAnswer}
            className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-[#07120d] shadow-[0_14px_35px_rgba(16,185,129,0.2)] transition active:scale-[0.98] hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#15120e]"
            aria-label={`Answer call from ${call.contactName}`}
          >
            <PhoneCall size={21} /> Answer
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}

export function usePortalVoice() {
  const context = useContext(VoiceContext)
  if (!context) throw new Error('usePortalVoice must be used inside PortalVoiceProvider.')
  return context
}

export function MobileActiveCallStrip() {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const { activeCall, isStartingCall, startingCallTarget, isMuted, toggleMute, hangUp, openCallView } = usePortalVoice()
  const incomingRinging = activeCall?.direction === 'inbound' && activeCall.phase === 'ringing'
  const visible = pathname !== '/portal/calls' && !incomingRinging && Boolean(activeCall || isStartingCall)
  const name = activeCall?.contactName || startingCallTarget?.contactName || activeCall?.phoneNumber || startingCallTarget?.phoneNumber || 'Call'
  const status = !activeCall ? 'Preparing call' : activeCall.mode === 'ring_phone'
    ? activeCall.bridgeStatusUnavailable ? 'Call status unavailable' : activeCall.bridgeStage === 'connected' ? 'Connected by phone' : activeCall.bridgeStage === 'connecting_client' ? 'Connecting client' : 'Calling your phone'
    : activeCall.phase === 'active' ? 'Connected to Luxor line' : activeCall.phase === 'ringing' ? 'Ringing' : 'Calling'

  return (
    <div className="md:hidden">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="mobile-active-call"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div role="region" aria-label="Active call" className="flex min-h-14 items-center gap-2 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5">
              <Link href="/portal/calls" onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openCallView() } }} aria-label={`Return to call with ${name}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
                <PhoneCall size={16} className="shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-[color:var(--portal-text)]">{name}</span><span className="block truncate text-[10px] text-[color:var(--portal-muted)]">{status}</span></span>
              </Link>
              {activeCall?.mode === 'browser' && activeCall.phase === 'active' && <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={isMuted} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">{isMuted ? <MicOff size={17} /> : <Mic size={17} />}</button>}
              {activeCall?.mode === 'browser' && <button type="button" onClick={hangUp} aria-label="End call" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"><PhoneOff size={17} /></button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type PhoneIndicatorState =
  | 'disconnected'
  | 'hover'
  | 'ready'
  | 'connecting'
  | 'active_good'
  | 'active_medium'
  | 'active_bad'

const indicatorCoreVariants = {
  disconnected: {
    backgroundColor: 'var(--portal-muted)',
    boxShadow: '0 0 0px rgba(0, 0, 0, 0)',
    scale: 1,
    opacity: 0.65,
  },
  hover: {
    backgroundColor: '#caa24c',
    boxShadow: '0 0 5px rgba(202, 162, 76, 0.5)',
    scale: 1,
    opacity: 1,
  },
  ready: {
    backgroundColor: '#10b981',
    boxShadow: '0 0 5px rgba(16, 185, 129, 0.6)',
    scale: 1,
    opacity: 1,
  },
  connecting: {
    backgroundColor: '#f59e0b',
    boxShadow: '0 0 6px rgba(245, 158, 11, 0.7)',
    scale: 1.05,
    opacity: 1,
  },
  active_good: {
    backgroundColor: '#10b981',
    boxShadow: '0 0 7px rgba(16, 185, 129, 0.85)',
    scale: 1.05,
    opacity: 1,
  },
  active_medium: {
    backgroundColor: '#f59e0b',
    boxShadow: '0 0 7px rgba(245, 158, 11, 0.85)',
    scale: 1.05,
    opacity: 1,
  },
  active_bad: {
    backgroundColor: '#ef4444',
    boxShadow: '0 0 8px rgba(239, 68, 68, 0.9)',
    scale: 1.05,
    opacity: 1,
  },
}

export function PhoneStatusIndicator({
  state,
  compact = false,
  className = '',
}: {
  state: PhoneIndicatorState
  compact?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer Glow Pulse for Active & Connecting states */}
      <AnimatePresence mode="wait">
        {(state === 'active_good' || state === 'active_medium' || state === 'active_bad' || state === 'connecting') && (
          <motion.span
            key={`pulse-${state}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={
              reduceMotion
                ? { scale: 1.3, opacity: 0.4 }
                : { scale: [1, 1.85, 1], opacity: [0.85, 0, 0.85] }
            }
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              duration: state === 'active_bad' ? 0.9 : state === 'connecting' ? 1.1 : 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`absolute inset-0 rounded-full pointer-events-none border ${
              state === 'active_good'
                ? 'border-emerald-400/70 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                : state === 'active_medium'
                ? 'border-amber-400/70 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                : state === 'active_bad'
                ? 'border-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.85)]'
                : 'border-amber-400/50 shadow-[0_0_6px_rgba(251,191,36,0.5)]'
            }`}
          />
        )}
      </AnimatePresence>

      {/* Core Indicator Circle - Solid color dot with Framer Motion spring & color morph animations */}
      <motion.span
        variants={indicatorCoreVariants}
        initial={false}
        animate={state}
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 24,
          backgroundColor: { duration: 0.25, ease: 'easeInOut' },
        }}
        className={`relative z-10 block rounded-full ring-1.5 ring-[color:var(--portal-card)] ${
          compact ? 'h-2 w-2' : 'h-2.5 w-2.5'
        }`}
      />
    </div>
  )
}

export function PortalPhoneButton({
  overrideState,
  compact = false,
  className = '',
}: {
  overrideState?: PhoneIndicatorState
  compact?: boolean
  className?: string
} = {}) {
  const { activeCall, callQuality, isPanelOpen, isStartingCall, openPanel, closePanel, openCallView, phoneState } = usePortalVoice()
  const [isHovered, setIsHovered] = useState(false)

  const computedState: PhoneIndicatorState = overrideState ?? (() => {
    if (activeCall) {
      if (activeCall.phase === 'dialing' || activeCall.phase === 'ringing') {
        return 'connecting'
      }
      if (callQuality === 'bad') return 'active_bad'
      if (callQuality === 'medium') return 'active_medium'
      return 'active_good'
    }
    if (isStartingCall) return 'connecting'
    if (phoneState === 'starting') return 'connecting'
    if (phoneState === 'ready') return 'ready'
    return 'disconnected'
  })()

  return (
    <button
      type="button"
      onClick={() => {
        const isMobile = window.matchMedia('(max-width: 767px)').matches
        if (activeCall?.mode === 'ring_phone' || (isMobile && (activeCall || isStartingCall))) openCallView()
        else if (isMobile) openCallView({ showKeypad: true })
        else if (isPanelOpen) closePanel()
        else openPanel()
      }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className={
        className ||
        (compact
          ? 'portal-header-action portal-ghost-icon-button relative flex h-9 w-9 !min-w-0 !min-h-0 items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10 group'
          : 'relative flex items-center justify-center rounded-xl p-2 transition-colors hover:bg-[color:var(--portal-soft)] cursor-pointer group')
      }
      aria-label={activeCall || isStartingCall ? 'Open active call' : 'Open Luxor phone'}
      title={
        activeCall?.mode === 'ring_phone'
          ? activeCall.bridgeStatusUnavailable ? 'Phone call status unavailable' : 'Call on your phone'
          : computedState === 'ready'
          ? 'Luxor phone ready'
          : computedState === 'active_good'
          ? 'Active call - Good connection'
          : computedState === 'active_medium'
          ? 'Active call - Medium connection'
          : computedState === 'active_bad'
          ? 'Active call - Poor connection'
          : computedState === 'connecting'
          ? 'Phone connecting...'
          : 'Phone disconnected'
      }
    >
      <div className="relative inline-flex items-center justify-center">
        <Phone
          size={compact ? 18 : 20}
          className={`transition-colors duration-200 ${
            activeCall
              ? computedState === 'active_good'
                ? 'text-emerald-500 dark:text-emerald-400'
                : computedState === 'active_medium'
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-red-500 dark:text-red-400'
              : 'text-[color:var(--portal-muted)] group-hover:text-[#caa24c]'
          }`}
        />
        {/* Active Circle Indicator positioned right at the ear piece of the handset */}
        <div className={`pointer-events-none absolute ${compact ? '-top-1 -right-1' : '-top-1 -right-1'}`}>
          <PhoneStatusIndicator
            state={computedState === 'disconnected' && isHovered ? 'hover' : computedState}
            compact={compact}
          />
        </div>
      </div>
    </button>
  )
}

function PortalPhonePanel({
  activeCall,
  dialMatch,
  dialNumber,
  isMuted,
  isOpen,
  isLookingUpNumber,
  phoneError,
  phoneState,
  onClose,
  onDial,
  onDialNumberChange,
  onEnable,
  onHangUp,
  onSendDigit,
  onToggleMute,
}: {
  activeCall: ActiveCall | null
  dialMatch: DialMatch | null
  dialNumber: string
  isMuted: boolean
  isOpen: boolean
  isLookingUpNumber: boolean
  phoneError: string | null
  phoneState: PhoneState
  onClose: () => void
  onDial: () => void
  onDialNumberChange: (value: string) => void
  onEnable: () => void
  onHangUp: () => void
  onSendDigit: (digit: string) => void
  onToggleMute: () => void
}) {
  const [now, setNow] = useState(0)
  const [showKeypad, setShowKeypad] = useState(false)
  const reduceMotion = useReducedMotion()
  const validDialNumber = toUsE164(dialNumber)

  useEffect(() => {
    if (activeCall?.phase !== 'active') return
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [activeCall?.phase])

  return (
    <AnimatePresence>
    {isOpen && <motion.aside
      layout={reduceMotion ? undefined : true}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 22, scale: 0.97 }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-4 top-20 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-[color:var(--portal-text)] shadow-[0_30px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
    >
      <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Luxor Browser Phone</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--portal-muted)]">
            <span className={`h-2 w-2 rounded-full ${phoneState === 'ready' ? 'bg-emerald-500' : phoneState === 'error' ? 'bg-red-500' : 'bg-[color:var(--portal-faint)]'}`} />
            {phoneState === 'ready' ? 'Ready for calls' : phoneState === 'starting' ? 'Connecting...' : phoneState === 'error' ? 'Needs attention' : 'Not enabled'}
          </div>
        </div>
        <PortalCloseButton onClick={onClose} aria-label="Close phone" />
      </div>

      {activeCall ? (
        <div className="py-6 text-center">
          <motion.div
            animate={reduceMotion ? undefined : { scale: activeCall.phase === 'active' ? [1, 1.06, 1] : [1, 1.12, 1] }}
            transition={{ duration: activeCall.phase === 'active' ? 1.8 : 1, repeat: Infinity }}
            className="mx-auto flex items-center justify-center"
          >
            <PortalContactAvatar name={activeCall.contactName} size="xl" className="shadow-[0_0_24px_rgba(202,162,76,0.15)]" />
          </motion.div>
          {activeCall.inquiryId ? (
            <Link
              href={`/portal/leads/${activeCall.inquiryId}`}
              className="mt-4 inline-block text-lg font-black text-[color:var(--portal-text)] hover:text-[#a8792f] dark:hover:text-[#caa24c] hover:underline transition-colors"
            >
              {activeCall.contactName}
            </Link>
          ) : (
            <p className="mt-4 text-lg font-black text-[color:var(--portal-text)]">{activeCall.contactName}</p>
          )}
          <p className="mt-1 font-mono text-xs text-[color:var(--portal-muted)]">{formatPhoneDisplay(activeCall.phoneNumber)}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            {activeCall.phase === 'active' ? formatDuration(Math.floor((Math.max(now, activeCall.startedAt) - activeCall.startedAt) / 1000)) : activeCall.phase}
          </p>
          {activeCall.phase === 'active' && !reduceMotion && (
            <div className="mt-3 flex h-4 items-end justify-center gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((bar) => <motion.span key={bar} className="w-1 rounded-full bg-emerald-500/70 dark:bg-emerald-400/70" animate={{ height: [4, 14 - Math.abs(2 - bar) * 2, 5] }} transition={{ duration: 0.7, repeat: Infinity, delay: bar * 0.08 }} />)}
            </div>
          )}

          {activeCall.phase === 'active' && showKeypad && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => (
                <button key={digit} type="button" onClick={() => onSendDigit(digit)} className="h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-sm font-bold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[#caa24c]/10 hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
                  {digit}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={onToggleMute} className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${isMuted ? 'border-[#caa24c]/45 bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'}`} aria-label={isMuted ? 'Unmute' : 'Mute'} aria-pressed={isMuted}>
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            
            {activeCall.phase === 'active' && (
              <button
                type="button"
                onClick={() => setShowKeypad(prev => !prev)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
                  showKeypad
                    ? 'border-[#caa24c]/40 bg-[#caa24c]/10 text-[#caa24c]'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45`}
                aria-label={showKeypad ? 'Hide keypad' : 'Show keypad'}
                title={showKeypad ? 'Hide keypad' : 'Show keypad'}
              >
                <Grid size={18} />
              </button>
            )}

            <button type="button" onClick={onHangUp} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-card)]" aria-label="Hang up">
              <PhoneOff size={19} />
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-5">
          {phoneState !== 'ready' && (
            <div className="mb-4 rounded-xl border border-[#caa24c]/15 bg-[#caa24c]/5 p-4">
              <div className="flex gap-3">
                {phoneState === 'starting' ? <Loader2 size={17} className="mt-0.5 animate-spin text-[#caa24c]" /> : <BellRing size={17} className="mt-0.5 text-[#caa24c]" />}
                <div>
                  <p className="text-xs font-bold text-[color:var(--portal-text)]">{phoneState === 'starting' ? 'Connecting this browser' : phoneState === 'disabled' ? 'Browser ringing is off' : 'Browser phone needs attention'}</p>
                  <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">{phoneState === 'disabled' ? 'Turn on browser ringing in phone settings to receive calls here.' : 'Keep the portal open. If needed, allow microphone access when answering.'}</p>
                  {phoneError && <p className="mt-2 text-[10px] text-red-600 dark:text-red-400">{phoneError}</p>}
                </div>
              </div>
              {phoneState !== 'disabled' && <button type="button" onClick={onEnable} disabled={phoneState === 'starting'} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#b98a3d] text-[10px] font-black uppercase tracking-wider !text-white transition-colors hover:bg-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50">
                {phoneState === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                {phoneState === 'starting' ? 'Connecting' : 'Retry connection'}
              </button>}
            </div>
          )}

          <label className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Phone number</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3">
            <Phone size={15} className="text-[color:var(--portal-muted)]" />
            <input
              type="tel"
              value={dialNumber}
              onChange={(event) => onDialNumberChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && validDialNumber) onDial()
              }}
              placeholder="Type number..."
              className="portal-input-transparent h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]"
            />
            {dialNumber && (
              <button type="button" onClick={() => onDialNumberChange(removeLastDialDigit(dialNumber))} className="rounded p-1 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45" aria-label="Delete digit">
                <Delete size={15} />
              </button>
            )}
          </div>
          <AnimatePresence mode="wait">
            {(dialMatch || isLookingUpNumber) && (
              <motion.div key={dialMatch?.id || 'looking'} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-2 rounded-lg border border-[#caa24c]/15 bg-[#caa24c]/5 px-3 py-2">
                {dialMatch ? (
                  <div className="flex items-center gap-3 text-left">
                    <PortalContactAvatar name={dialMatch.fullName} size="sm" />
                    <div>
                      <Link
                        href={`/portal/leads/${dialMatch.id}`}
                        className="block text-xs font-bold text-[color:var(--portal-text)] hover:text-[#a8792f] dark:hover:text-[#caa24c] hover:underline transition-colors"
                      >
                        {dialMatch.fullName}
                      </Link>
                      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#caa24c]">{dialMatch.eventType || 'Luxor inquiry'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-[10px] text-[color:var(--portal-muted)]">
                    <Loader2 size={11} className="animate-spin" /> Checking Luxor contacts...
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={onDial}
            disabled={!validDialNumber || phoneState === 'starting'}
            className="portal-call-btn portal-green-btn luxor-green-raised mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed"
          >
            <PhoneCall size={16} className="!text-white !stroke-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
            <span className="!text-white font-black" style={{ color: '#ffffff' }}>Call from Luxor</span>
          </button>
        </div>
      )}
    </motion.aside>}
    </AnimatePresence>
  )
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.max(0, totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
