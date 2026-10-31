export type ElenaVoiceState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'closing' | 'ended'
const VOICE_IDLE_TIMEOUT_MS = 2 * 60 * 1_000

type ElenaLiveVoiceOptions = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  onEvent: (event: Record<string, unknown>) => void
  onState: (state: ElenaVoiceState) => void
  onError: (message: string) => void
  onLevel: (level: number) => void
}

/** Owns the microphone, WebRTC transport, playback and audio meter for one Elena call. */
export class ElenaLiveVoiceClient {
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private microphone: MediaStream | null = null
  private audio = new Audio()
  private audioContext: AudioContext | null = null
  private animationFrame = 0
  private analysers: AnalyserNode[] = []
  private idleTimer: number | undefined
  private disposed = false

  constructor(private readonly options: ElenaLiveVoiceOptions) {
    this.audio.autoplay = true
    this.audio.setAttribute('playsinline', 'true')
  }

  async start() {
    this.options.onState('connecting')
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
        throw new Error('Voice needs microphone access in a secure browser window.')
      }

      this.microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (this.disposed) return this.cleanup()
      this.measure(this.microphone)

      const peer = this.peer = new RTCPeerConnection()
      this.microphone.getAudioTracks().forEach((track) => peer.addTrack(track, this.microphone!))
      peer.ontrack = (event) => {
        if (this.disposed) return
        const stream = event.streams[0] || new MediaStream([event.track])
        this.audio.srcObject = stream
        void this.audio.play().catch(() => this.options.onError('Tap the screen to allow Elena’s voice to play.'))
        this.measure(stream)
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' && !this.disposed) {
          this.options.onError('The voice connection was lost. Please reconnect.')
          this.stop()
        }
      }

      const channel = this.channel = peer.createDataChannel('oai-events')
      channel.onmessage = ({ data }) => {
        if (this.disposed) return
        let event: Record<string, unknown>
        try { event = JSON.parse(data) as Record<string, unknown> } catch { return }
        if (event.type === 'session.started') {
          this.options.onState('listening')
          this.resetIdleTimeout()
          this.sendCommentary('Hi, we can work through this together. What’s on your mind?', null)
        }
        if (['input_audio_buffer.speech_started', 'session.input_transcript.delta', 'session.input_transcript.completed', 'response.audio.delta', 'session.output_audio_buffer.started'].includes(String(event.type))) this.resetIdleTimeout()
        if (event.type === 'session.delegation.created') this.options.onState('thinking')
        if (event.type === 'session.output_audio_buffer.started' || event.type === 'response.audio.delta') this.options.onState('speaking')
        if (event.type === 'session.output_audio_buffer.stopped') this.options.onState('listening')
        if (event.type === 'session.closed') this.stop()
        if (event.type === 'error') {
          this.options.onError('Elena’s voice session encountered an error. Please try again.')
          this.stop()
        }
        this.options.onEvent(event)
      }
      channel.onclose = () => {
        if (!this.disposed) {
          this.options.onError('Elena’s voice connection ended.')
          this.cleanup()
        }
      }

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await this.waitForIce(peer)
      if (this.disposed) return

      const sdp = peer.localDescription?.sdp
      if (!sdp) throw new Error('Could not prepare the microphone connection.')

      const response = await fetch('/api/portal/elena-chat/voice-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp, messages: this.options.messages.slice(-12) }),
        cache: 'no-store',
      })
      const result = await response.json() as { error?: string; transport?: { sdp?: string } }
      if (!response.ok || typeof result.transport?.sdp !== 'string') {
        throw new Error(result.error || 'Elena could not start voice. Please try again.')
      }
      if (this.disposed) return
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp })
    } catch (error) {
      if (this.disposed) return
      const name = error instanceof Error ? error.name : ''
      const message = name === 'NotAllowedError'
        ? 'Allow microphone access for the Luxor portal, then start voice again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect one and try again.'
          : error instanceof Error ? error.message : 'Elena could not connect to voice.'
      this.options.onError(message)
      this.cleanup()
    }
  }

  sendCommentary(content: string, delegationId: string | null) {
    if (this.disposed || this.channel?.readyState !== 'open') return
    this.channel.send(JSON.stringify({
      type: 'session.commentary.append',
      delegation_id: delegationId,
      content: content.slice(0, 1_500),
      event_id: crypto.randomUUID(),
    }))
  }

  sendThinking(content: string, delegationId: string) {
    if (this.disposed || this.channel?.readyState !== 'open') return
    this.channel.send(JSON.stringify({
      type: 'session.thinking.append',
      delegation_id: delegationId,
      content,
      event_id: crypto.randomUUID(),
    }))
  }

  mute(muted: boolean) {
    if (this.disposed) return
    this.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted })
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify({ type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute', event_id: crypto.randomUUID() }))
    }
    if (muted) this.options.onLevel(0)
  }

  stop() {
    if (this.disposed) return
    this.options.onState('closing')
    if (this.channel?.readyState === 'open') {
      try { this.channel.send(JSON.stringify({ type: 'session.close', event_id: crypto.randomUUID() })) } catch { /* Transport may already be closed. */ }
    }
    this.cleanup()
  }

  private async waitForIce(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The secure voice connection timed out.')), 8_000)
      const cleanup = () => { window.clearTimeout(timeout); peer.removeEventListener('icegatheringstatechange', check) }
      const check = () => {
        if (peer.iceGatheringState === 'complete') { cleanup(); resolve() }
        if (peer.connectionState === 'failed') { cleanup(); reject(new Error('The secure voice connection failed.')) }
      }
      peer.addEventListener('icegatheringstatechange', check)
      check()
    })
  }

  private resetIdleTimeout() {
    window.clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(() => {
      if (this.disposed) return
      this.options.onError('Voice ended after two minutes without activity. Start again whenever you’re ready.')
      this.stop()
    }, VOICE_IDLE_TIMEOUT_MS)
  }

  private measure(stream: MediaStream) {
    try {
      const context = this.audioContext || (this.audioContext = new AudioContext())
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      this.analysers.push(analyser)
      if (this.animationFrame) return
      const sample = () => {
        if (this.disposed) return
        let peak = 0
        for (const input of this.analysers) {
          const values = new Uint8Array(input.frequencyBinCount)
          input.getByteTimeDomainData(values)
          let energy = 0
          for (const value of values) energy += ((value - 128) / 128) ** 2
          peak = Math.max(peak, Math.sqrt(energy / values.length))
        }
        this.options.onLevel(Math.min(1, peak * 4.5))
        this.animationFrame = requestAnimationFrame(sample)
      }
      sample()
    } catch {
      this.options.onLevel(0)
    }
  }

  private cleanup() {
    if (this.disposed) return
    this.disposed = true
    window.clearTimeout(this.idleTimer)
    cancelAnimationFrame(this.animationFrame)
    this.microphone?.getTracks().forEach((track) => track.stop())
    this.channel?.close()
    this.peer?.close()
    this.audio.pause()
    this.audio.srcObject = null
    void this.audioContext?.close().catch(() => {})
    this.options.onLevel(0)
    this.options.onState('ended')
  }
}
