export type SandboxVoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended'
export type SandboxVoiceMessage = { role: 'user' | 'assistant'; content: string }

type Options = {
  voice: string
  onState: (state: SandboxVoiceState) => void
  onTranscript: (messages: SandboxVoiceMessage[]) => void
  onError: (message: string) => void
  onResult: (result: { message: string; result?: unknown }) => void
  onLevel: (level: number) => void
}

/** A separate, short-lived practice session; never delegates to the owner assistant. */
export class ElenaVoiceSandboxClient {
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private microphone: MediaStream | null = null
  private audio: HTMLAudioElement
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private frame = 0
  private disposed = false
  private controller = new AbortController()
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined
  private durationTimer: ReturnType<typeof setTimeout> | undefined
  private delegationTimers = new Set<ReturnType<typeof setTimeout>>()
  private handledDelegations = new Set<string>()
  private messages: SandboxVoiceMessage[] = []
  private delegationQueue: Promise<void> = Promise.resolve()

  constructor(private options: Options) {
    this.audio = new Audio()
    this.audio.autoplay = true
    this.audio.setAttribute('playsinline', 'true')
  }

  async start() {
    this.options.onState('connecting')
    this.connectTimer = setTimeout(() => this.fail('The voice connection timed out. Please try again.'), 40_000)
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
        throw new Error('Open this page in a secure browser with microphone support.')
      }
      try {
        this.context = new AudioContext()
        void this.context.resume().catch(() => {})
      } catch { /* The meter is optional. */ }
      this.microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (this.disposed) { this.microphone.getTracks().forEach((track) => track.stop()); return }
      this.startMeter(this.microphone)
      const peer = this.peer = new RTCPeerConnection()
      this.microphone.getAudioTracks().forEach((track) => peer.addTrack(track, this.microphone!))
      peer.ontrack = ({ streams, track }) => {
        if (this.disposed) return
        this.audio.srcObject = streams[0] || new MediaStream([track])
        void this.audio.play().catch(() => this.options.onError('Audio playback is paused. Select Resume audio.'))
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' && !this.disposed) this.fail('The voice connection was lost. Please start another test.')
      }
      const channel = this.channel = peer.createDataChannel('oai-events')
      channel.onmessage = ({ data }) => this.handleEvent(data)
      channel.onclose = () => { if (!this.disposed) this.stop() }
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await this.waitForIce(peer)
      if (this.disposed) return
      const response = await fetch('/api/portal/elena-voice/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, voice: this.options.voice }),
        cache: 'no-store', signal: this.controller.signal,
      })
      const result = await response.json() as { error?: string; transport?: { sdp?: string } }
      if (!response.ok || typeof result.transport?.sdp !== 'string') throw new Error(result.error || 'Elena could not connect. Please try again.')
      if (!this.disposed) await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp })
    } catch (error) {
      if (this.disposed) return
      const name = error instanceof Error ? error.name : ''
      this.fail(name === 'NotAllowedError' ? 'Allow microphone access, then start the test again.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
          : error instanceof Error ? error.message : 'Elena could not connect.')
    }
  }

  resumeAudio() {
    void this.audio.play().catch(() => this.options.onError('The browser is still blocking audio. Check this site’s audio permissions.'))
    void this.context?.resume().catch(() => {})
  }

  mute(muted: boolean) {
    this.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted })
    this.send({ type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute' })
  }

  stop() {
    if (this.disposed) return
    this.send({ type: 'session.close' })
    this.disposed = true
    this.controller.abort()
    clearTimeout(this.connectTimer)
    clearTimeout(this.idleTimer)
    clearTimeout(this.durationTimer)
    this.delegationTimers.forEach(clearTimeout)
    cancelAnimationFrame(this.frame)
    this.microphone?.getTracks().forEach((track) => track.stop())
    this.channel?.close()
    this.peer?.close()
    this.audio.pause()
    this.audio.srcObject = null
    void this.context?.close().catch(() => {})
    this.options.onLevel(0)
    this.options.onState('ended')
  }

  private send(event: Record<string, unknown>) {
    if (!this.disposed && this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify({ ...event, event_id: crypto.randomUUID() }))
    }
  }

  private fail(message: string) { this.options.onError(message); this.stop() }

  private handleEvent(raw: unknown) {
    if (this.disposed || typeof raw !== 'string') return
    let event: Record<string, unknown>
    try { event = JSON.parse(raw) as Record<string, unknown> } catch { return }
    if (event.type === 'session.started') {
      clearTimeout(this.connectTimer)
      this.options.onState('listening')
      this.resetIdle()
      this.durationTimer = setTimeout(() => this.fail('This ten-minute practice session has ended. Start a new test to continue.'), 10 * 60_000)
      this.send({ type: 'session.commentary.append', delegation_id: null, content: 'Hi, you’ve reached Luxor at Las Palmas. I’m Elena, the AI concierge. What are you planning?' })
    }
    if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (typeof event.delta !== 'string') return
      this.resetIdle()
      const role = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant'
      const last = this.messages.at(-1)
      if (last?.role === role) last.content = (last.content + event.delta).slice(-12_000)
      else this.messages.push({ role, content: event.delta })
      this.messages = this.messages.slice(-40)
      this.options.onTranscript(this.messages.map((message) => ({ ...message })))
    }
    if (event.type === 'session.output_audio_buffer.started') { this.resetIdle(); this.options.onState('speaking') }
    if (event.type === 'session.output_audio_buffer.stopped') this.options.onState('listening')
    if (event.type === 'session.delegation.created') {
      const delegation = event.delegation as { id?: unknown } | undefined
      if (typeof delegation?.id !== 'string' || this.handledDelegations.has(delegation.id)) return
      const id = delegation.id
      this.handledDelegations.add(id)
      this.options.onState('thinking')
      // Live may request delegation just before the final transcript fragment arrives.
      const timer = setTimeout(() => {
        this.delegationTimers.delete(timer)
        this.delegationQueue = this.delegationQueue.then(() => this.delegate(id))
      }, 1_200)
      this.delegationTimers.add(timer)
    }
    if (event.type === 'session.closed') this.stop()
    if (event.type === 'error') this.fail('Elena’s voice session encountered an error. Please start another test.')
  }

  private async delegate(id: string) {
    if (this.disposed) return
    const messages = this.messages.slice(-12).map(({ role, content }) => ({ role, content: content.slice(-2000) }))
    const transcript = messages.filter((message) => message.role === 'user').at(-1)?.content || ''
    if (!messages.some((message) => message.role === 'user' && message.content.trim())) {
      this.send({ type: 'session.commentary.append', delegation_id: id, content: 'I didn’t catch that. Could you say it again?' })
      return
    }
    try {
      const response = await fetch('/api/portal/elena-voice/tools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, messages, delegationId: id }), cache: 'no-store',
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000)]),
      })
      const result = await response.json() as { message?: string; result?: unknown; error?: string }
      if (!response.ok || typeof result.message !== 'string') throw new Error(result.error || 'The practice request could not finish.')
      if (this.disposed) return
      this.options.onResult({ message: result.message, result: result.result })
      this.send({ type: 'session.commentary.append', delegation_id: id, content: result.message })
    } catch (error) {
      if (this.disposed) return
      this.options.onError(error instanceof Error ? error.message : 'The practice request could not finish.')
      this.send({ type: 'session.commentary.append', delegation_id: id, content: 'I couldn’t check that right now. I don’t want to give you the wrong information.' })
    }
  }

  private resetIdle() {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.fail('The test ended after two minutes without activity.'), 2 * 60_000)
  }

  private async waitForIce(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve, reject) => {
      const check = () => { if (peer.iceGatheringState === 'complete') { cleanup(); resolve() } }
      const abort = () => { cleanup(); reject(new Error('Connection cancelled.')) }
      const timer = setTimeout(() => { cleanup(); reject(new Error('The microphone connection timed out. Please try again.')) }, 8_000)
      const cleanup = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', check); this.controller.signal.removeEventListener('abort', abort) }
      peer.addEventListener('icegatheringstatechange', check)
      this.controller.signal.addEventListener('abort', abort, { once: true })
      check()
    })
  }

  private startMeter(stream: MediaStream) {
    try {
      if (!this.context) return
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 256
      this.context.createMediaStreamSource(stream).connect(this.analyser)
      const values = new Uint8Array(this.analyser.frequencyBinCount)
      const measure = () => {
        if (this.disposed || !this.analyser) return
        this.analyser.getByteTimeDomainData(values)
        const energy = values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0)
        this.options.onLevel(Math.min(1, Math.sqrt(energy / values.length) * 4.5))
        this.frame = requestAnimationFrame(measure)
      }
      measure()
    } catch { /* Voice remains usable without the meter. */ }
  }
}
