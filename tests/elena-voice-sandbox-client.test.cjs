/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function harness(getUserMedia) {
  const timers = new Map()
  const states = [], errors = [], requests = [], peers = []
  let timerId = 0
  class Audio {
    setAttribute() {}
    play() { return Promise.resolve() }
    pause() { this.paused = true }
  }
  class Peer {
    constructor() { this.iceGatheringState = 'complete'; peers.push(this) }
    addTrack() {}
    createDataChannel() {
      return this.channel = { readyState: 'open', sent: [], send(raw) { this.sent.push(JSON.parse(raw)) }, close() { this.closed = true } }
    }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\nsynthetic-offer' } }
    async setLocalDescription(value) { this.localDescription = value }
    async setRemoteDescription(value) { this.remoteDescription = value }
    close() { this.closed = true }
  }
  const exports = {}
  const sandbox = {
    exports, navigator: { mediaDevices: { getUserMedia } }, RTCPeerConnection: Peer,
    Audio, Error, AbortController, AbortSignal, crypto: { randomUUID: () => 'synthetic-event' },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id },
    clearTimeout: (id) => timers.delete(id), cancelAnimationFrame() {},
    fetch: async (url, init) => {
      requests.push({ url, init })
      return Response.json({ session: { id: 'live_synthetic' }, transport: { sdp: 'v=0\r\nsynthetic-answer' } })
    },
  }
  sandbox.globalThis = sandbox
  const file = path.resolve(__dirname, '../src/lib/elenaVoiceSandboxClient.ts')
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(source, sandbox, { filename: file })
  const client = new exports.ElenaVoiceSandboxClient({
    voice: 'marin', onState: (state) => states.push(state), onError: (error) => errors.push(error),
    onTranscript() {}, onResult() {}, onLevel() {},
  })
  return { client, timers, states, errors, requests, peers }
}

function syntheticMicrophone() {
  const track = { stops: 0, enabled: true, stop() { this.stops += 1 } }
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } }
}

test('denying microphone access ends practice without opening a provider session', async () => {
  const denied = new Error('Denied')
  denied.name = 'NotAllowedError'
  const h = harness(async () => { throw denied })
  await h.client.start()
  assert.equal(h.requests.length, 0)
  assert.equal(h.peers.length, 0)
  assert.equal(h.timers.size, 0)
  assert.equal(h.states.at(-1), 'ended')
  assert.match(h.errors[0], /Allow microphone access/)
})

test('ending practice while permission is pending stops a microphone granted later', async () => {
  let grant
  const microphone = syntheticMicrophone()
  const h = harness(() => new Promise((resolve) => { grant = resolve }))
  const starting = h.client.start()
  h.client.stop()
  grant(microphone.stream)
  await starting
  assert.equal(microphone.track.stops, 1)
  assert.equal(h.requests.length, 0)
  assert.equal(h.peers.length, 0)
  assert.equal(h.timers.size, 0)
})

test('ending a connected practice releases the microphone, transport and session timers', async () => {
  const microphone = syntheticMicrophone()
  const h = harness(async () => microphone.stream)
  await h.client.start()
  const peer = h.peers[0]
  peer.channel.onmessage({ data: JSON.stringify({ type: 'session.started' }) })
  h.client.mute(true)
  assert.equal(microphone.track.enabled, false)
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, '/api/portal/elena-voice/session')
  assert.equal(h.requests[0].init.signal.aborted, false)
  h.client.stop()
  assert.equal(microphone.track.stops, 1)
  assert.equal(peer.closed, true)
  assert.equal(peer.channel.closed, true)
  assert.equal(h.requests[0].init.signal.aborted, true)
  assert.equal(h.timers.size, 0)
  assert.equal(h.states.at(-1), 'ended')
  assert.equal(peer.channel.sent.at(-1).type, 'session.close')
  h.client.stop()
  assert.equal(microphone.track.stops, 1)
})

test('ending practice cancels pending delegation before any backend action can run', async () => {
  const microphone = syntheticMicrophone()
  const h = harness(async () => microphone.stream)
  await h.client.start()
  const channel = h.peers[0].channel
  channel.onmessage({ data: JSON.stringify({ type: 'session.started' }) })
  channel.onmessage({ data: JSON.stringify({ type: 'session.input_transcript.delta', delta: 'Please book a tour.' }) })
  channel.onmessage({ data: JSON.stringify({ type: 'session.delegation.created', delegation: { id: 'delegation-synthetic' } }) })
  assert.ok([...h.timers.values()].some(({ delay }) => delay === 1200))
  h.client.stop()
  assert.equal(h.timers.size, 0)
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, '/api/portal/elena-voice/session')
})
