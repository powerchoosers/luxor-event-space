'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Loader2, Mic, MicOff, Phone, PhoneOff, RefreshCw, Volume2 } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalSelect } from '@/components/portal/PortalUI'
import { ElenaVoiceSandboxClient, type SandboxVoiceMessage, type SandboxVoiceState } from '@/lib/elenaVoiceSandboxClient'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import type { PublicLuxorTourSlot } from '@/lib/luxorTourSlots'

type Configuration = {
  voices: string[]
  defaultVoice: string
  model: string
  publicNumber: string | null
  numbers: Array<{ phoneNumber: string; friendlyName: string; isActive: boolean; isPublic: boolean; voiceUrl: string }>
  phoneTest: { ready: boolean; detail: string; phoneNumber?: string; voice: string | null }
  context: { venue: boolean; pricing: boolean; knowledge: boolean; availability: boolean }
  slots: PublicLuxorTourSlot[]
}

const STATE_LABELS: Record<SandboxVoiceState, string> = {
  idle: 'Ready when you are', connecting: 'Connecting microphone…', listening: 'Listening',
  thinking: 'Checking Luxor details', speaking: 'Elena is speaking', ended: 'Test ended',
}

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

export function ElenaVoiceSandbox() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [voice, setVoice] = useState('marin')
  const [state, setState] = useState<SandboxVoiceState>('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<SandboxVoiceMessage[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [toolResult, setToolResult] = useState<string | null>(null)
  const [savingPhoneVoice, setSavingPhoneVoice] = useState(false)
  const [phoneVoiceError, setPhoneVoiceError] = useState('')
  const [phoneVoiceSaved, setPhoneVoiceSaved] = useState('')
  const client = useRef<ElenaVoiceSandboxClient | null>(null)
  const voiceChoiceMade = useRef(false)
  const meter = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const isActive = !['idle', 'ended'].includes(state)
  const isConnected = isActive && state !== 'connecting'

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/portal/elena-voice', { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Voice settings could not load.')
      if (!Array.isArray(result.voices) || !result.phoneTest || !result.context) throw new Error('Voice settings are incomplete. Please retry.')
      if (!mounted.current) return
      setConfiguration(result)
      setVoice((previous) => voiceChoiceMade.current && result.voices.includes(previous)
        ? previous
        : result.voices.includes(result.phoneTest.voice) ? result.phoneTest.voice : result.defaultVoice)
    } catch (error) {
      if (mounted.current) setLoadError(error instanceof Error ? error.message : 'Voice settings could not load.')
    } finally { if (mounted.current) setLoading(false) }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false; client.current?.stop(); client.current = null }
  }, [load])

  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => setElapsed((previous) => previous + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isActive])

  useEffect(() => {
    const element = transcript.current
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 180) {
      element.scrollTop = element.scrollHeight
    }
  }, [messages])

  const start = () => {
    if (isActive || !configuration) return
    client.current?.stop()
    setError('')
    setMuted(false)
    setElapsed(0)
    setMessages([])
    setToolResult(null)
    const next = new ElenaVoiceSandboxClient({
      voice,
      onState: (nextState) => { if (mounted.current) setState(nextState) },
      onTranscript: (nextMessages) => { if (mounted.current) setMessages(nextMessages) },
      onError: (message) => { if (mounted.current) setError(message) },
      onResult: ({ message, result }) => {
        if (!mounted.current || !result || typeof result !== 'object') return
        const record = result as Record<string, unknown>
        const label = typeof record.message === 'string' ? record.message : typeof record.summary === 'string' ? record.summary : ['booking', 'transfer'].some((kind) => String(record.kind).includes(kind)) ? message : null
        if (label) setToolResult(label)
      },
      onLevel: (level) => { if (meter.current) meter.current.style.transform = `scaleX(${level})` },
    })
    client.current = next
    void next.start()
  }

  const toggleMute = () => { client.current?.mute(!muted); setMuted(!muted) }
  const savePhoneVoice = async (selectedVoice: string) => {
    if (!configuration?.phoneTest.voice || savingPhoneVoice || selectedVoice === configuration.phoneTest.voice) return
    setSavingPhoneVoice(true)
    setPhoneVoiceError('')
    setPhoneVoiceSaved('')
    try {
      const response = await fetch('/api/portal/elena-voice', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: selectedVoice }), cache: 'no-store', signal: AbortSignal.timeout(20_000),
      })
      const result = await response.json() as { voice?: string; appliesTo?: string; error?: string }
      if (!response.ok || typeof result.voice !== 'string' || result.appliesTo !== 'next_phone_call') {
        throw new Error(result.error || 'The phone voice could not be saved. Please try again.')
      }
      const savedVoice = result.voice
      if (!mounted.current) return
      setConfiguration((previous) => previous ? { ...previous, phoneTest: { ...previous.phoneTest, voice: savedVoice } } : previous)
      setPhoneVoiceSaved(`${titleCase(savedVoice)} is set for the next phone call.`)
    } catch (error) {
      if (mounted.current) setPhoneVoiceError(error instanceof Error ? error.message : 'The phone voice could not be saved.')
    } finally { if (mounted.current) setSavingPhoneVoice(false) }
  }
  const chooseVoice = (nextVoice: string) => {
    voiceChoiceMade.current = true
    setVoice(nextVoice)
    setPhoneVoiceSaved('')
    setPhoneVoiceError('')
    if (nextVoice !== configuration?.phoneTest.voice) void savePhoneVoice(nextVoice)
  }
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const seconds = String(elapsed % 60).padStart(2, '0')

  return <PortalPageFrame className="!max-w-[1200px] pb-6">
    <PortalPageHeader title="Elena voice sandbox" description="Find the right voice. Rehearse a real inquiry, tour booking, or handoff." actions={
      <Link href="/portal/settings" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Settings<ChevronRight size={14} /></Link>
    } />

    {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300"><p>{loadError}</p><PortalButton className="min-h-11" onClick={() => void load()}><RefreshCw size={14} />Retry</PortalButton></div> : null}

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <section aria-labelledby="voice-practice-heading" className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="border-b border-[color:var(--portal-border)] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="voice-practice-heading" className="text-base font-bold text-[color:var(--portal-text)]">Browser practice</h2>
            <span className="text-xs text-[color:var(--portal-muted)]">GPT Live</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Talk to Elena as an incoming caller. Tour bookings and transfers are rehearsed; this practice does not reserve a time or call Arianna.</p>
          <div className="mt-5 max-w-sm">
            <p className="mb-2 text-xs font-semibold text-[color:var(--portal-text)]">Elena’s voice</p>
            <PortalSelect aria-label="Elena’s voice" value={voice} onChange={chooseVoice} disabled={loading || !configuration || isActive || savingPhoneVoice} options={(configuration?.voices || ['marin']).map((name) => ({ value: name, label: `${titleCase(name)}${name === configuration?.defaultVoice ? ' · default' : ''}` }))} buttonClassName="!min-h-11" />
            <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{isActive ? 'End this test to choose another voice.' : savingPhoneVoice ? 'Saving for your next phone call…' : 'Each test starts a fresh conversation; your choice is saved for the next phone call.'}</p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {isActive ? <>
              <PortalButton variant="danger" className="min-h-11" onClick={() => client.current?.stop()}><PhoneOff size={16} />End test</PortalButton>
              <PortalButton className="min-h-11" onClick={toggleMute} disabled={!isConnected} aria-pressed={muted}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? 'Unmute' : 'Mute'}</PortalButton>
            </> : <PortalButton variant="primary" className="min-h-11 !text-white" onClick={start} disabled={loading || !configuration}>{loading ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Mic size={16} />}{state === 'ended' ? 'Start another test' : 'Start voice test'}</PortalButton>}
            <div role="status" aria-live="polite" className="flex min-h-11 items-center gap-2.5 text-xs text-[color:var(--portal-muted)]">
              {state === 'connecting' ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : null}
              <span>{loading ? 'Loading voice settings…' : muted && isConnected ? 'Microphone muted' : STATE_LABELS[state]}</span>
              {isActive || elapsed > 0 ? <span className="tabular-nums">{minutes}:{seconds}</span> : null}
            </div>
          </div>
          {isConnected ? <div className="mt-3 flex items-center gap-2.5" aria-hidden="true"><Mic size={12} className="text-[color:var(--portal-muted)]" /><div className="h-1 w-24 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"><div ref={meter} className="h-full origin-left bg-[#a8792f]" style={{ transform: 'scaleX(0)' }} /></div></div> : null}
          {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm leading-6 text-red-700 dark:text-red-300"><p>{error}</p>{isConnected && /audio|playback/i.test(error) ? <PortalButton className="mt-2 min-h-11" onClick={() => { setError(''); client.current?.resumeAudio() }}><Volume2 size={15} />Resume audio</PortalButton> : null}</div> : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Conversation</h3><span className="text-xs text-[color:var(--portal-muted)]">This session only</span></div>
        <div ref={transcript} role="log" aria-label="Voice test transcript" aria-live="off" tabIndex={0} className="h-[300px] overflow-y-auto overscroll-auto p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 sm:h-[360px] sm:p-6">
          {messages.length ? <div className="space-y-5">{messages.map(({ role, content }, index) => <div key={index} className={`max-w-[96%] ${role === 'user' ? 'ml-auto rounded-xl bg-[color:var(--portal-soft)] px-4 py-3' : ''}`}><p className="mb-1 text-xs font-semibold text-[color:var(--portal-muted)]">{role === 'user' ? 'You · caller' : 'Elena'}</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--portal-text)] [overflow-wrap:anywhere]">{content}</p></div>)}</div> : <div className="flex h-full flex-col justify-center text-center"><p className="text-sm font-semibold text-[color:var(--portal-text)]">Hear how Elena handles the conversation.</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[color:var(--portal-muted)]">Start a test, then ask about an event, interrupt with a question, or request a tour. The transcript will appear here.</p></div>}
        </div>
        {toolResult ? <p role="status" className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 text-sm leading-6 text-[color:var(--portal-text)] sm:px-6">{toolResult}</p> : null}
      </section>

      <aside className="min-w-0 space-y-6 xl:py-1">
        <section aria-labelledby="phone-test-heading" className="border-b border-[color:var(--portal-border)] pb-6">
          <h2 id="phone-test-heading" className="flex items-center gap-2 text-base font-bold text-[color:var(--portal-text)]"><Phone size={17} />Phone test</h2>
          {loading ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Checking the test line…</p> : <>
            <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">{configuration?.phoneTest.ready ? 'Test line is ready' : 'Test line needs setup'}</p>
            {configuration?.phoneTest.phoneNumber ? <p className="mt-1 text-lg font-semibold tabular-nums text-[color:var(--portal-text)]">{formatPhoneDisplay(configuration.phoneTest.phoneNumber)}</p> : null}
            <p className="mt-2 break-words text-sm leading-6 text-[color:var(--portal-muted)]">{configuration?.phoneTest.detail || 'Load the voice settings to check the test number.'}</p>
          </>}
          {configuration?.publicNumber ? <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Public Luxor line: <span className="whitespace-nowrap tabular-nums">{formatPhoneDisplay(configuration.publicNumber)}</span></p> : null}
          {!loading && configuration ? <div className="mt-5 space-y-2.5">
            <p className="text-sm text-[color:var(--portal-text)]">Next phone call: <span className="font-semibold">{configuration.phoneTest.voice ? titleCase(configuration.phoneTest.voice) : 'Unavailable'}</span></p>
            <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Voice changes apply to the next call. An active call keeps its original voice.</p>
            {phoneVoiceSaved ? <p role="status" className="text-xs leading-5 text-[color:var(--portal-text)]">{phoneVoiceSaved}</p> : null}
            {phoneVoiceError ? <p role="alert" className="text-xs leading-5 text-red-700 dark:text-red-300">{phoneVoiceError}</p> : null}
          </div> : null}
        </section>

        <section aria-labelledby="context-heading">
          <h2 id="context-heading" className="text-base font-bold text-[color:var(--portal-text)]">What Elena knows</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Current Luxor information, refreshed when you start a conversation.</p>
          <ul className="mt-3 space-y-3 text-sm text-[color:var(--portal-text)]">
            {([
              ['venue', 'Venue details and capacity'], ['knowledge', 'Published Elena knowledge'],
              ['pricing', 'Approved public starting rates'], ['availability', 'Available tour times'],
            ] as const).map(([key, label]) => <li key={key} className="flex items-start gap-2.5"><span className="mt-0.5 shrink-0 text-[color:var(--portal-muted)]">{loading ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : configuration?.context[key] ? <Check size={15} /> : <span className="inline-block w-[15px] text-center">—</span>}</span><span>{label}{!loading && configuration && !configuration.context[key] ? <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">Unavailable; Elena should ask the team to confirm.</span> : null}</span></li>)}
          </ul>
        </section>

        <details className="border-t border-[color:var(--portal-border)] pt-5">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">A useful test call</summary>
          <ol className="mt-1 space-y-3 pl-5 text-sm leading-6 text-[color:var(--portal-muted)] list-decimal"><li>Ask about your event and a price. Does she answer clearly before asking questions?</li><li>Interrupt or correct the guest count. Does she listen and adapt?</li><li>Ask for a tour. Does she offer real times and read back the details?</li><li>Ask for Arianna. Does she explain the handoff without making you repeat everything?</li></ol>
          <p className="mt-4 text-xs leading-5 text-[color:var(--portal-muted)]">Judge accuracy, pacing, interruptions, and the next step. Browser practice uses OpenAI voice usage.</p>
        </details>
      </aside>
    </div>
  </PortalPageFrame>
}
