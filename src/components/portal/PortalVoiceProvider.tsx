'use client'

import { Call, Device } from '@twilio/voice-sdk'
import {
  BellRing,
  Delete,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  X,
} from 'lucide-react'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/portal/ToastProvider'

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

type VoiceContextValue = {
  phoneState: PhoneState
  unreadCount: number
  isPanelOpen: boolean
  activeCall: ActiveCall | null
  openPanel: () => void
  closePanel: () => void
  enablePhone: () => Promise<void>
  startCall: (target: DialTarget) => Promise<void>
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function PortalVoiceProvider({ children }: { children: React.ReactNode }) {
  const { notify } = useToast()
  const [phoneState, setPhoneState] = useState<PhoneState>('disabled')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [dialNumber, setDialNumber] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const deviceRef = useRef<Device | null>(null)
  const currentCallRef = useRef<Call | null>(null)
  const initializingRef = useRef<Promise<Device> | null>(null)

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
    if (currentCallRef.current) {
      notify({ title: 'Call already active', description: 'End the current call before starting another.', variant: 'error' })
      return
    }

    try {
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
    }
  }, [attachCallEvents, initializeDevice, notify])

  useEffect(() => {
    const handleStartCall = (event: Event) => {
      const detail = (event as CustomEvent<DialTarget>).detail
      if (!detail?.phoneNumber) return
      setDialNumber(detail.phoneNumber)
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
    unreadCount,
    isPanelOpen,
    activeCall,
    openPanel: () => setIsPanelOpen(true),
    closePanel: () => setIsPanelOpen(false),
    enablePhone,
    startCall,
  }), [activeCall, enablePhone, isPanelOpen, phoneState, startCall, unreadCount])

  return (
    <VoiceContext.Provider value={contextValue}>
      {children}
      <PortalPhonePanel
        activeCall={activeCall}
        dialNumber={dialNumber}
        incomingCall={incomingCall}
        isMuted={isMuted}
        isOpen={isPanelOpen}
        phoneError={phoneError}
        phoneState={phoneState}
        onAnswer={answerIncoming}
        onClose={() => setIsPanelOpen(false)}
        onDial={() => void startCall({ phoneNumber: dialNumber })}
        onDialNumberChange={setDialNumber}
        onEnable={() => void enablePhone()}
        onHangUp={hangUp}
        onReject={rejectIncoming}
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

export function PortalPhoneButton() {
  const { activeCall, isPanelOpen, openPanel, closePanel, phoneState, unreadCount } = usePortalVoice()

  return (
    <button
      type="button"
      onClick={isPanelOpen ? closePanel : openPanel}
      className="relative rounded-full p-2 transition-colors hover:bg-[color:var(--portal-soft)]"
      aria-label={activeCall ? 'Open active call' : 'Open Luxor phone'}
      title={phoneState === 'ready' ? 'Luxor phone ready' : 'Open Luxor phone'}
    >
      {activeCall ? <PhoneCall size={18} className="text-emerald-400" /> : <Phone size={18} className="text-zinc-400" />}
      <span className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border border-black ${
        phoneState === 'ready' ? 'bg-emerald-400' : phoneState === 'error' ? 'bg-red-400' : 'bg-zinc-600'
      }`} />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-black bg-[#caa24c] px-1 font-mono text-[8px] font-black text-black">
          {Math.min(unreadCount, 99)}
        </span>
      )}
    </button>
  )
}

function PortalPhonePanel({
  activeCall,
  dialNumber,
  incomingCall,
  isMuted,
  isOpen,
  phoneError,
  phoneState,
  onAnswer,
  onClose,
  onDial,
  onDialNumberChange,
  onEnable,
  onHangUp,
  onReject,
  onSendDigit,
  onToggleMute,
}: {
  activeCall: ActiveCall | null
  dialNumber: string
  incomingCall: IncomingCall | null
  isMuted: boolean
  isOpen: boolean
  phoneError: string | null
  phoneState: PhoneState
  onAnswer: () => void
  onClose: () => void
  onDial: () => void
  onDialNumberChange: (value: string) => void
  onEnable: () => void
  onHangUp: () => void
  onReject: () => void
  onSendDigit: (digit: string) => void
  onToggleMute: () => void
}) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (activeCall?.phase !== 'active') return
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [activeCall?.phase])

  if (incomingCall) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-3xl border border-[#caa24c]/30 bg-[#090806] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
          <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full border border-[#caa24c]/35 bg-[#caa24c]/10 text-[#f1d27a]">
            <PhoneIncoming size={28} />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Incoming Luxor Call</p>
          <h2 className="mt-3 font-serif text-3xl font-semibold text-white">{incomingCall.contactName}</h2>
          <p className="mt-2 font-mono text-sm text-zinc-400">{formatPhone(incomingCall.phoneNumber)}</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button type="button" onClick={onReject} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 text-xs font-black uppercase tracking-wider text-red-300 hover:bg-red-500/15">
              <PhoneOff size={17} /> Decline
            </button>
            <button type="button" onClick={onAnswer} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black uppercase tracking-wider text-black hover:bg-emerald-400">
              <PhoneCall size={17} /> Answer
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <aside className="fixed right-4 top-20 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[#caa24c]/20 bg-[#080807]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[#caa24c]/10 pb-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Luxor Browser Phone</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${phoneState === 'ready' ? 'bg-emerald-400' : phoneState === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
            {phoneState === 'ready' ? 'Ready for calls' : phoneState === 'starting' ? 'Connecting...' : phoneState === 'error' ? 'Needs attention' : 'Not enabled'}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Close phone">
          <X size={16} />
        </button>
      </div>

      {activeCall ? (
        <div className="py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <PhoneCall size={24} />
          </div>
          <p className="mt-4 text-lg font-black text-white">{activeCall.contactName}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{formatPhone(activeCall.phoneNumber)}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
            {activeCall.phase === 'active' ? formatDuration(Math.floor((Math.max(now, activeCall.startedAt) - activeCall.startedAt) / 1000)) : activeCall.phase}
          </p>

          {activeCall.phase === 'active' && (
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
              <button type="button" onClick={onEnable} disabled={phoneState === 'starting'} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#caa24c] text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50">
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
                if (event.key === 'Enter' && dialNumber.trim()) onDial()
              }}
              placeholder="(210) 555-0123"
              className="h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-zinc-700"
            />
            {dialNumber && (
              <button type="button" onClick={() => onDialNumberChange(dialNumber.slice(0, -1))} className="p-1 text-zinc-600 hover:text-white" aria-label="Delete digit">
                <Delete size={15} />
              </button>
            )}
          </div>
          <button type="button" onClick={onDial} disabled={!dialNumber.trim() || phoneState === 'starting'} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black uppercase tracking-wider text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">
            <PhoneCall size={16} /> Call from Luxor
          </button>
        </div>
      )}
    </aside>
  )
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length !== 10) return value
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.max(0, totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
