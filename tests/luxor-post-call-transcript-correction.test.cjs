/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relative, stubs = {}) {
  const filename = path.join(root, relative)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => (Object.hasOwn(stubs, name) ? stubs[name] : original(name))
  loaded._compile(source, filename)
  return loaded.exports
}

const correction = compile('src/lib/luxorPostCallTranscriptCorrectionServer.ts', {
  'server-only': {},
  './luxorDualChannelAudio': {},
  './luxorCallTypes': compile('src/lib/luxorCallTypes.ts', { 'server-only': {} }),
  './luxorCallsServer': {},
  './supabaseRestServer': {},
})

const audio = compile('src/lib/luxorDualChannelAudio.ts', {
  'server-only': {},
  'mpg123-decoder': { MPEGDecoder: class { async ready() {} decode() { return { channelData: [], sampleRate: 44100, samplesDecoded: 0 } } free() {} } },
})

test('shouldKeepTwilioTranscript guards short clips and length drift', () => {
  assert.equal(correction.shouldKeepTwilioTranscript({ clipDurationSeconds: 0.8, twilioText: 'hello world', candidateText: 'hello', hadApiError: false }), true)
  assert.equal(correction.shouldKeepTwilioTranscript({ clipDurationSeconds: 2, twilioText: 'hello world', candidateText: '', hadApiError: false }), true)
  assert.equal(correction.shouldKeepTwilioTranscript({ clipDurationSeconds: 2, twilioText: 'one two three four', candidateText: 'one', hadApiError: false }), true)
  assert.equal(correction.shouldKeepTwilioTranscript({ clipDurationSeconds: 2, twilioText: 'hello world', candidateText: 'hello there world', hadApiError: false }), false)
  assert.equal(correction.shouldKeepTwilioTranscript({ clipDurationSeconds: 2, twilioText: 'hello world', candidateText: 'better hello world', hadApiError: true }), true)
})

test('segmentClipWindow pads and ends at the next segment start', () => {
  const ordered = [
    { segment_start_seconds: 5 },
    { segment_start_seconds: 11 },
    { segment_start_seconds: 20 },
  ]
  const window = correction.segmentClipWindow(ordered, 0, 60)
  assert.equal(window.start, 4.7)
  assert.equal(window.end, 11.3)
  assert.ok(window.duration > 6)
})

test('buildCorrectedSnapshotSegments keeps every ordered row when corrections are partial', () => {
  const maxSegments = 96
  const ordered = Array.from({ length: maxSegments + 8 }, (_, index) => ({
    id: `seg-${index}`,
    track: index % 2 === 0 ? 'caller' : 'luxor_agent',
    segment_text: `line ${index}`,
    english_text: null,
    spoken_languages: [],
    translation_status: 'not_requested',
    event_timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    segment_start_seconds: index,
  }))
  const corrections = new Map([['seg-0', 'line zero corrected']])
  const snapshot = correction.buildCorrectedSnapshotSegments(ordered, corrections)
  assert.equal(snapshot.length, ordered.length)
  assert.equal(snapshot[0].text, 'line zero corrected')
  assert.equal(snapshot[maxSegments + 7].text, `line ${maxSegments + 7}`)
})

test('buildCorrectedSnapshotSegments keeps twilio text unless corrected', () => {
  const rows = [{
    id: 'a', track: 'caller', segment_text: 'Hola', english_text: 'Hello', spoken_languages: ['Spanish'], translation_status: 'completed', event_timestamp: '2026-01-01T00:00:05.000Z', segment_start_seconds: 5,
  }, {
    id: 'b', track: 'luxor_agent', segment_text: 'Welcome', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-01-01T00:00:10.000Z', segment_start_seconds: 10,
  }]
  const corrections = new Map([['b', 'Welcome to Luxor']])
  const snapshot = correction.buildCorrectedSnapshotSegments(rows, corrections)
  assert.equal(snapshot[0].text, 'Hello')
  assert.equal(snapshot[0].originalText, 'Hola')
  assert.equal(snapshot[1].text, 'Welcome to Luxor')
  assert.equal(snapshot[1].originalText, 'Welcome')
})

test('sliceChannelToWav returns a wav buffer', () => {
  const sampleRate = 8000
  const left = new Float32Array(sampleRate).fill(0.1)
  const right = new Float32Array(sampleRate).fill(-0.1)
  const wav = audio.sliceChannelToWav({ sampleRate, channels: [left, right], durationSeconds: 1 }, 0, 0, 0.5)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
})

test('post-call correction is disabled unless env flag is set', () => {
  const previous = process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION
  delete process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION
  assert.equal(correction.postCallTranscriptCorrectionEnabled(), false)
  process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION = '1'
  assert.equal(correction.postCallTranscriptCorrectionEnabled(), true)
  if (previous === undefined) delete process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION
  else process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION = previous
})