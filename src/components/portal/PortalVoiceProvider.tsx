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
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/portal/ToastProvider'
import { PortalContactAvatar, PortalCloseButton } from '@/components/portal/PortalUI'
import { formatPhoneDisplay, formatUsDialInput, removeLastDialDigit, toUsE164 } from '@/lib/luxorPhoneClient'

type PhoneState = 'disabled' | 'starting' | 'ready' | 'error'
type CallPhase = 'dialing' | 'ringing' | 'active'

type DialTarget = {
  phoneNumber: string
  contactName?: string | null
  inquiryId?: string | null
}

type ActiveCall = {
  direction: 'inbound' | 'outbound'
  phoneNumber: string
  contactName: string
  inquiryId: string | null
  twilioCallSid: string | null
  phase: CallPhase
  startedAt: number
}

type IncomingCall = ActiveCall & { call: Call }

type DialMatch = {
  id: string
  fullName: string
  eventType: string | null
  phoneNumber: string | null
}

type VoiceContextValue = {
  phoneState: PhoneState
  callQuality: 'good' | 'medium' | 'bad'
  unreadCount: number
  isPanelOpen: boolean
  activeCall: ActiveCall | null
  setCallQuality: (quality: 'good' | 'medium' | 'bad') => void
  openPanel: () => void
  closePanel: () => void
  enablePhone: () => Promise<void>
  startCall: (target: DialTarget) => Promise<void>
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function PortalVoiceProvider({ children }: { children: React.ReactNode }) {
  const { notify, dismiss } = useToast()
  const incomingCallToastIdRef = useRef<string | null>(null)
  const [phoneState, setPhoneState] = useState<PhoneState>('disabled')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [callQuality, setCallQuality] = useState<'good' | 'medium' | 'bad'>('good')
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [dialNumber, setDialNumber] = useState('')
  const [dialMatch, setDialMatch] = useState<DialMatch | null>(null)
  const [isLookingUpNumber, setIsLookingUpNumber] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const deviceRef = useRef<Device | null>(null)
  const currentCallRef = useRef<Call | null>(null)
  const initializingRef = useRef<Promise<Device> | null>(null)
  const bridgeStartingRef = useRef(false)

  const loadUnreadCount = useCallback(async () => {
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
    void loadUnreadCount()
    const intervalId = window.setInterval(loadUnreadCount, 30_000)
    return () => window.clearInterval(intervalId)
  }, [loadUnreadCount])

  const refreshToken = useCallback(async () => {
    const response = await fetch('/api/twilio/token', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({})) as { token?: string; error?: string }
    if (!response.ok || !payload.token) {
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
    if (incomingCallToastIdRef.current) {
      dismiss(incomingCallToastIdRef.current)
      incomingCallToastIdRef.current = null
    }
    window.dispatchEvent(new Event('luxor-call-history-refresh'))
    window.setTimeout(loadUnreadCount, 1000)
  }, [loadUnreadCount, dismiss])

  const attachCallEvents = useCallback((call: Call, initial: ActiveCall) => {
    currentCallRef.current = call
    setActiveCall(initial)

    call.on('ringing', () => {
      setActiveCall((current) => current ? { ...current, phase: 'ringing' } : current)
    })
    call.on('accept', () => {
      setActiveCall((current) => current ? { ...current, phase: 'active', startedAt: Date.now() } : current)
      setIncomingCall(null)
      setIsPanelOpen(true)
      if (incomingCallToastIdRef.current) {
        dismiss(incomingCallToastIdRef.current)
        incomingCallToastIdRef.current = null
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
  }, [clearCall, notify])

  const handleIncomingCall = useCallback((call: Call) => {
    const contactName = call.customParameters.get('CallerName') || 'Unknown caller'
    const phoneNumber = call.customParameters.get('CallerNumber') || call.parameters.From || 'Unknown number'
    const inquiryId = call.customParameters.get('InquiryId') || null
    const parentCallSid = call.customParameters.get('ParentCallSid') || call.parameters.CallSid || null
    const incoming: IncomingCall = {
      call,
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

    // Trigger the incoming call toast notification
    let toastId = ''
    toastId = notify({
      title: (
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Incoming Call</span>
          {inquiryId ? (
            <Link
              href={`/portal/leads/${inquiryId}`}
              onClick={() => dismiss(toastId)}
              className="mt-0.5 inline-block text-sm font-bold text-white hover:text-[#caa24c] hover:underline transition-colors"
            >
              {contactName}
            </Link>
          ) : (
            <span className="mt-0.5 text-sm font-bold text-white">{contactName}</span>
          )}
        </div>
      ),
      description: (
        <span className="font-mono text-zinc-400 text-[11px]">
          {formatPhoneDisplay(phoneNumber)}
        </span>
      ),
      icon: (
        <PortalContactAvatar
          name={contactName}
          size="sm"
          className="border-[#caa24c]/40 bg-[#caa24c]/15 text-[#caa24c]"
        />
      ),
      variant: 'warning',
      durationMs: 0,
      action: (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (toastId) dismiss(toastId)
              call.reject()
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/15"
          >
            <PhoneOff size={11} /> Decline
          </button>
          <button
            type="button"
            onClick={() => {
              if (toastId) dismiss(toastId)
              call.accept()
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-wider text-black hover:bg-emerald-400"
          >
            <PhoneCall size={11} /> Answer
          </button>
        </div>
      )
    })
    incomingCallToastIdRef.current = toastId

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(`Incoming Luxor call: ${contactName}`, {
        body: phoneNumber,
        icon: '/favicon.ico',
        tag: parentCallSid || `luxor-call-${phoneNumber}`,
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }, [attachCallEvents])

  const initializeDevice = useCallback(async () => {
    if (deviceRef.current && deviceRef.current.state !== Device.State.Destroyed) {
      if (deviceRef.current.state === Device.State.Unregistered) {
        await deviceRef.current.register()
      }
      return deviceRef.current
    }
    if (initializingRef.current) return initializingRef.current

    const pending = (async () => {
      setPhoneState('starting')
      setPhoneError(null)
      const token = await refreshToken()
      const device = new Device(token, {
        allowIncomingWhileBusy: false,
        appName: 'Luxor Owner Portal',
        appVersion: '1.0.0',
        closeProtection: 'A Luxor call is active. Leave this page?',
      })

      device.on('registering', () => setPhoneState('starting'))
      device.on('registered', () => setPhoneState('ready'))
      device.on('unregistered', () => setPhoneState('disabled'))
      device.on('incoming', handleIncomingCall)
      device.on('tokenWillExpire', async () => {
        try {
          device.updateToken(await refreshToken())
        } catch (error) {
          console.error('Luxor phone token refresh failed:', error)
        }
      })
      device.on('error', (error) => {
        setPhoneState('error')
        setPhoneError(error.message || 'The browser phone could not connect.')
      })

      deviceRef.current = device
      await device.register()
      return device
    })()

    initializingRef.current = pending
    try {
      return await pending
    } finally {
      initializingRef.current = null
    }
  }, [handleIncomingCall, refreshToken])

  const enablePhone = useCallback(async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      await initializeDevice()
      notify({
        title: 'Luxor phone is ready',
        description: 'Incoming calls will now ring in this browser.',
        variant: 'success',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enable the browser phone.'
      setPhoneState('error')
      setPhoneError(message)
      notify({ title: 'Phone setup failed', description: message, variant: 'error' })
    }
  }, [initializeDevice, notify])

  const startCall = useCallback(async (target: DialTarget) => {
    if (currentCallRef.current || bridgeStartingRef.current) {
      notify({ title: 'Call already active', description: 'End the current call before starting another.', variant: 'error' })
      return
    }

    try {
      const settingsResponse = await fetch('/api/twilio/phone-settings', { cache: 'no-store' })
      const settings = await settingsResponse.json().catch(() => ({})) as { outbound_mode?: 'browser' | 'ring_phone'; ring_to_number?: string | null; error?: string }
      if (!settingsResponse.ok) throw new Error(settings.error || 'Unable to load the Luxor dialing preference.')

      if (settings.outbound_mode === 'ring_phone') {
        bridgeStartingRef.current = true
        const response = await fetch('/api/twilio/calls/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target),
        })
        const payload = await response.json().catch(() => ({})) as { error?: string; ringToNumber?: string }
        if (!response.ok) throw new Error(payload.error || 'Twilio could not ring your phone.')
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
        direction: 'outbound',
        phoneNumber: target.phoneNumber,
        contactName: target.contactName || target.phoneNumber,
        inquiryId: target.inquiryId || null,
        twilioCallSid: null,
        phase: 'dialing',
        startedAt: Date.now(),
      }
      attachCallEvents(call, nextCall)
      setIsPanelOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The call could not be started.'
      notify({ title: 'Unable to call', description: message, variant: 'error' })
    } finally {
      bridgeStartingRef.current = false
    }
  }, [attachCallEvents, initializeDevice, notify])

  useEffect(() => {
    const handleStartCall = (event: Event) => {
      const detail = (event as CustomEvent<DialTarget>).detail
      if (!detail?.phoneNumber) return
      setDialNumber(formatUsDialInput(detail.phoneNumber))
      setIsPanelOpen(true)
      void startCall(detail)
    }
    window.addEventListener('luxor-start-call', handleStartCall)
    return () => window.removeEventListener('luxor-start-call', handleStartCall)
  }, [startCall])

  useEffect(() => {
    return () => {
      currentCallRef.current?.disconnect()
      deviceRef.current?.destroy()
    }
  }, [])

  const answerIncoming = useCallback(() => {
    if (!incomingCall) return
    incomingCall.call.accept()
    if (incomingCall.twilioCallSid) {
      void fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twilioCallSid: incomingCall.twilioCallSid, isRead: true }),
      }).then(loadUnreadCount)
    }
  }, [incomingCall, loadUnreadCount])

  const rejectIncoming = useCallback(() => {
    incomingCall?.call.reject()
    setIncomingCall(null)
  }, [incomingCall])

  const hangUp = useCallback(() => {
    currentCallRef.current?.disconnect()
    clearCall()
  }, [clearCall])

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted
    currentCallRef.current?.mute(nextMuted)
    setIsMuted(nextMuted)
  }, [isMuted])

  const contextValue = useMemo<VoiceContextValue>(() => ({
    phoneState,
    callQuality,
    unreadCount,
    isPanelOpen,
    activeCall,
    setCallQuality,
    openPanel: () => setIsPanelOpen(true),
    closePanel: () => setIsPanelOpen(false),
    enablePhone,
    startCall,
  }), [activeCall, callQuality, enablePhone, isPanelOpen, phoneState, startCall, unreadCount])

  return (
    <VoiceContext.Provider value={contextValue}>
      {children}
      <PortalPhonePanel
        activeCall={activeCall}
        dialNumber={dialNumber}
        isMuted={isMuted}
        isOpen={isPanelOpen}
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
        onSendDigit={(digit) => currentCallRef.current?.sendDigits(digit)}
        onToggleMute={toggleMute}
      />
    </VoiceContext.Provider>
  )
}

export function usePortalVoice() {
  const context = useContext(VoiceContext)
  if (!context) throw new Error('usePortalVoice must be used inside PortalVoiceProvider.')
  return context
}

export type PhoneIndicatorState =
  | 'disconnected'
  | 'ready'
  | 'connecting'
  | 'active_good'
  | 'active_medium'
  | 'active_bad'

const indicatorCoreVariants = {
  disconnected: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderColor: 'var(--portal-muted)',
    borderWidth: '1.75px',
    boxShadow: '0 0 0px rgba(0, 0, 0, 0)',
    scale: 1,
    opacity: 0.85,
  },
  ready: {
    backgroundColor: '#10b981',
    borderColor: 'rgba(9, 9, 11, 0.9)',
    borderWidth: '1px',
    boxShadow: '0 0 5px rgba(16, 185, 129, 0.5)',
    scale: 1,
    opacity: 1,
  },
  connecting: {
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
    borderColor: '#f59e0b',
    borderWidth: '1.75px',
    boxShadow: '0 0 6px rgba(245, 158, 11, 0.5)',
    scale: [0.95, 1.1, 0.95],
    opacity: 1,
  },
  active_good: {
    backgroundColor: '#34d399',
    borderColor: 'rgba(9, 9, 11, 0.95)',
    borderWidth: '1px',
    boxShadow: '0 0 8px rgba(52, 211, 153, 0.9)',
    scale: 1.05,
    opacity: 1,
  },
  active_medium: {
    backgroundColor: '#fbbf24',
    borderColor: 'rgba(9, 9, 11, 0.95)',
    borderWidth: '1px',
    boxShadow: '0 0 8px rgba(251, 191, 36, 0.9)',
    scale: 1.05,
    opacity: 1,
  },
  active_bad: {
    backgroundColor: '#ef4444',
    borderColor: 'rgba(9, 9, 11, 0.95)',
    borderWidth: '1px',
    boxShadow: '0 0 10px rgba(239, 68, 68, 0.95)',
    scale: 1.05,
    opacity: 1,
  },
}

export function PhoneStatusIndicator({
  state,
  className = '',
}: {
  state: PhoneIndicatorState
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
                : { scale: [1, 1.85, 1], opacity: [0.8, 0, 0.8] }
            }
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              duration: state === 'active_bad' ? 0.9 : state === 'connecting' ? 1.1 : 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`absolute inset-0 rounded-full pointer-events-none ${
              state === 'active_good'
                ? 'bg-emerald-400/60 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
                : state === 'active_medium'
                ? 'bg-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                : state === 'active_bad'
                ? 'bg-red-500/70 shadow-[0_0_10px_rgba(239,68,68,0.95)]'
                : 'bg-amber-400/40 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
            }`}
          />
        )}
      </AnimatePresence>

      {/* Core Indicator Circle with Framer Motion spring & color morph animations */}
      <motion.span
        variants={indicatorCoreVariants}
        initial={false}
        animate={state}
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 24,
          backgroundColor: { duration: 0.3, ease: 'easeInOut' },
          borderColor: { duration: 0.3, ease: 'easeInOut' },
        }}
        className="relative z-10 block h-2.5 w-2.5 rounded-full border border-solid"
      />
    </div>
  )
}

export function PortalPhoneButton({
  overrideState,
}: {
  overrideState?: PhoneIndicatorState
} = {}) {
  const { activeCall, callQuality, isPanelOpen, openPanel, closePanel, phoneState } = usePortalVoice()

  const computedState: PhoneIndicatorState = overrideState ?? (() => {
    if (activeCall) {
      if (activeCall.phase === 'dialing' || activeCall.phase === 'ringing') {
        return 'connecting'
      }
      if (callQuality === 'bad') return 'active_bad'
      if (callQuality === 'medium') return 'active_medium'
      return 'active_good'
    }
    if (phoneState === 'starting') return 'connecting'
    if (phoneState === 'ready') return 'ready'
    return 'disconnected'
  })()

  return (
    <button
      type="button"
      onClick={isPanelOpen ? closePanel : openPanel}
      className="relative flex items-center justify-center rounded-full p-2 transition-colors hover:bg-[color:var(--portal-soft)] cursor-pointer group"
      aria-label={activeCall ? 'Open active call' : 'Open Luxor phone'}
      title={
        computedState === 'ready'
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
      <Phone
        size={20}
        className={`transition-colors duration-200 ${
          activeCall
            ? computedState === 'active_good'
              ? 'text-emerald-400'
              : computedState === 'active_medium'
              ? 'text-amber-400'
              : 'text-red-400'
            : phoneState === 'ready'
            ? 'text-emerald-400 dark:text-emerald-400'
            : 'text-[color:var(--portal-muted)] group-hover:text-[color:var(--portal-text)]'
        }`}
      />
      {/* Active Circle Indicator positioned top-right close to the phone handset, matching HubSpot */}
      <div className="absolute top-[5px] right-[5px] pointer-events-none">
        <PhoneStatusIndicator state={computedState} />
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
      className="fixed right-4 top-20 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[#caa24c]/20 bg-[#080807]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-[#caa24c]/10 pb-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Luxor Browser Phone</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${phoneState === 'ready' ? 'bg-emerald-400' : phoneState === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
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
              className="mt-4 inline-block text-lg font-black text-white hover:text-[#caa24c] hover:underline transition-colors"
            >
              {activeCall.contactName}
            </Link>
          ) : (
            <p className="mt-4 text-lg font-black text-white">{activeCall.contactName}</p>
          )}
          <p className="mt-1 font-mono text-xs text-zinc-500">{formatPhoneDisplay(activeCall.phoneNumber)}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
            {activeCall.phase === 'active' ? formatDuration(Math.floor((Math.max(now, activeCall.startedAt) - activeCall.startedAt) / 1000)) : activeCall.phase}
          </p>
          {activeCall.phase === 'active' && !reduceMotion && (
            <div className="mt-3 flex h-4 items-end justify-center gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((bar) => <motion.span key={bar} className="w-1 rounded-full bg-emerald-400/70" animate={{ height: [4, 14 - Math.abs(2 - bar) * 2, 5] }} transition={{ duration: 0.7, repeat: Infinity, delay: bar * 0.08 }} />)}
            </div>
          )}

          {activeCall.phase === 'active' && showKeypad && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => (
                <button key={digit} type="button" onClick={() => onSendDigit(digit)} className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 text-sm font-bold text-zinc-300 hover:border-[#caa24c]/30 hover:text-white">
                  {digit}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={onToggleMute} className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white" aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            
            {activeCall.phase === 'active' && (
              <button
                type="button"
                onClick={() => setShowKeypad(prev => !prev)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
                  showKeypad
                    ? 'border-[#caa24c]/40 bg-[#caa24c]/10 text-[#caa24c]'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700'
                }`}
                aria-label={showKeypad ? 'Hide keypad' : 'Show keypad'}
                title={showKeypad ? 'Hide keypad' : 'Show keypad'}
              >
                <Grid size={18} />
              </button>
            )}

            <button type="button" onClick={onHangUp} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-400" aria-label="Hang up">
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
                  <p className="text-xs font-bold text-white">Enable this browser to receive calls</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">Keep the portal open. Your browser may ask for notification and microphone permission.</p>
                  {phoneError && <p className="mt-2 text-[10px] text-red-400">{phoneError}</p>}
                </div>
              </div>
              <button type="button" onClick={onEnable} disabled={phoneState === 'starting'} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#caa24c] text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50">
                {phoneState === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                {phoneState === 'starting' ? 'Connecting' : 'Enable Phone'}
              </button>
            </div>
          )}

          <label className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Phone number</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3">
            <Phone size={15} className="text-zinc-600" />
            <input
              type="tel"
              value={dialNumber}
              onChange={(event) => onDialNumberChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && validDialNumber) onDial()
              }}
              placeholder="Type number..."
              className="portal-input-transparent h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-zinc-700"
            />
            {dialNumber && (
              <button type="button" onClick={() => onDialNumberChange(removeLastDialDigit(dialNumber))} className="p-1 text-zinc-600 hover:text-white" aria-label="Delete digit">
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
                        className="block text-xs font-bold text-white hover:text-[#caa24c] hover:underline transition-colors"
                      >
                        {dialMatch.fullName}
                      </Link>
                      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#caa24c]">{dialMatch.eventType || 'Luxor inquiry'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-[10px] text-zinc-550">
                    <Loader2 size={11} className="animate-spin" /> Checking Luxor contacts...
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="button" onClick={onDial} disabled={!validDialNumber || phoneState === 'starting'} className="portal-call-btn mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-emerald-400 hover:shadow-[0_0_24px_rgba(52,211,153,0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none">
            <PhoneCall size={16} /> Call from Luxor
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
