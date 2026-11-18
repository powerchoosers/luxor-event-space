/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const MODEL_SID = 'elena_live_model_output'

function loadCallsServer() {
  const filename = path.resolve(__dirname, '../src/lib/luxorCallsServer.ts')
  const inserted = []
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const transpileTs = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loadTs = (file, parent) => {
    const child = new Module(file, parent); child.filename = file; child.paths = Module._nodeModulePaths(path.dirname(file))
    const orig = child.require.bind(child)
    child.require = (n) => (n === 'server-only' ? {} : orig(n))
    child._compile(transpileTs(file), file)
    return child.exports
  }
  mod.require = (name) => {
    if (name === 'server-only') return {}
    if (name === './luxorCallTypes') return loadTs(path.resolve(__dirname, '../src/lib/luxorCallTypes.ts'), mod)
    if (name === './luxorElenaLiveTranscriptSnapshot') return loadTs(path.resolve(__dirname, '../src/lib/luxorElenaLiveTranscriptSnapshot.ts'), mod)
    if (name === './supabaseRestServer') return {
      supabaseRest: async (query, init = {}) => {
        if (!init.method) {
          if (query.includes('luxor_calls?') && query.includes('twilio_call_sid')) {
            return [{
              id: 'call-id', twilio_call_sid: 'CA' + '1'.repeat(32), recording_consent_status: 'automatic', metadata: { scope: 'elena_live_inbound', openai_session_id: 'live_session' },
              recording_started_at: '2026-11-14T19:25:00.000Z', answered_at: '2026-11-14T19:25:00.000Z', started_at: '2026-11-14T19:24:50.000Z',
              transcription_status: 'processing', summary_status: 'not_generated', updated_at: '2026-11-14T19:25:00.000Z', last_sequence_number: 0,
            }]
          }
          if (query.includes('transcription_sid=eq.elena_live_model_output')) return []
          return []
        }
        inserted.push({ query, body: JSON.parse(init.body) })
        return init.headers?.Prefer?.includes('return=representation') ? [{ id: 'seg-id' }] : []
      },
    }
    if (name === './luxorInquiriesServer') return { listLuxorInquiries: async () => [], getLuxorInquiry: async () => null }
    return Module.prototype.require.call(mod, name)
  }
  mod._compile(transpileTs(filename), filename)
  return { exports: mod.exports, inserted }
}

function sipCall(overrides = {}) {
  return {
    id: 'call-id',
    recording_started_at: '2026-11-14T19:25:00.000Z',
    metadata: { scope: 'elena_live_inbound', ...overrides },
  }
}

test('elena live inbound still stores agent ASR rows for fallback', async () => {
  const { exports, inserted } = loadCallsServer()
  await exports.saveLuxorTranscriptEvent({
    callSid: 'CA' + '1'.repeat(32), event: 'transcription-content', sequenceId: 11, transcriptionSid: 'GT' + '4'.repeat(32),
    transcriptionData: JSON.stringify({ track: 'inbound_track', transcript: 'Luzor pricing' }), final: 'true',
  })
  const segment = inserted.find((row) => row.query.startsWith('luxor_call_transcript_segments'))?.body
  assert.equal(segment.track, 'caller')
})

test('completed sideband keeps model agent rows when coverage matches ASR', () => {
  const { exports } = loadCallsServer()
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello', segment_start_seconds: 1, event_timestamp: '2026-11-14T19:25:01.000Z' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'ASR Luzor', segment_start_seconds: 5, event_timestamp: '2026-11-14T19:25:05.000Z' },
    { track: 'luxor_agent', transcription_sid: MODEL_SID, segment_text: 'Luxor at Las Palmas', segment_start_seconds: 5, event_timestamp: '2026-11-14T19:25:05.000Z' },
  ]
  const selected = exports.elenaLiveSnapshotTranscriptRows(sipCall({ agent_transcript_sideband: 'completed' }), rows)
  assert.deepEqual(selected.map((row) => row.segment_text), ['hello', 'Luxor at Las Palmas'])
})

test('completed sideband falls back to ASR when model rows are thin', () => {
  const { exports } = loadCallsServer()
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello', segment_start_seconds: 1 },
    { track: 'luxor_agent', transcription_sid: MODEL_SID, segment_text: 'last reply only', segment_start_seconds: 90 },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'greeting', segment_start_seconds: 2 },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'middle', segment_start_seconds: 40 },
  ]
  const selected = exports.elenaLiveSnapshotTranscriptRows(sipCall({ agent_transcript_sideband: 'completed' }), rows)
  assert.deepEqual(selected.map((row) => row.segment_text), ['hello', 'greeting', 'middle'])
})

test('partial sideband keeps agent ASR after the last model turn', () => {
  const { exports } = loadCallsServer()
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello', segment_start_seconds: 1, event_timestamp: '2026-11-14T19:25:01.000Z' },
    { track: 'luxor_agent', transcription_sid: MODEL_SID, segment_text: 'Opening', segment_start_seconds: 10, event_timestamp: '2026-11-14T19:25:10.000Z' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'Early ASR', segment_start_seconds: 8, event_timestamp: '2026-11-14T19:25:08.000Z' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'Late ASR', segment_start_seconds: 900, event_timestamp: '2026-11-14T19:40:00.000Z' },
  ]
  const selected = exports.elenaLiveSnapshotTranscriptRows(sipCall({ agent_transcript_sideband: 'partial' }), rows)
  assert.deepEqual(selected.map((row) => row.segment_text), ['hello', 'Opening', 'Late ASR'])
})

test('missing sideband uses agent ASR when model rows exist', () => {
  const { exports } = loadCallsServer()
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello' },
    { track: 'luxor_agent', transcription_sid: MODEL_SID, segment_text: 'Model only' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'ASR only' },
  ]
  const selected = exports.elenaLiveSnapshotTranscriptRows(sipCall(), rows)
  assert.deepEqual(selected.map((row) => row.segment_text), ['hello', 'ASR only'])
})

test('getLuxorTranscriptSegments dedupes Elena agent rows for post-call correction input', async () => {
  const callId = 'call-id'
  const call = {
    id: callId,
    recording_started_at: '2026-11-14T19:25:00.000Z',
    transcript_segments: [],
    metadata: { scope: 'elena_live_inbound', agent_transcript_sideband: 'completed' },
  }
  const rawRows = [
    { id: '1', call_id: callId, transcription_sid: 'GT123', sequence_id: 1, track: 'caller', segment_text: 'hello', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:01.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 },
    { id: '2', call_id: callId, transcription_sid: 'GT123', sequence_id: 2, track: 'luxor_agent', segment_text: 'ASR Luzor', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:05.000Z', segment_audio_timestamp: null, segment_start_seconds: 5 },
    { id: '3', call_id: callId, transcription_sid: MODEL_SID, sequence_id: 3, track: 'luxor_agent', segment_text: 'Luxor at Las Palmas', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:05.000Z', segment_audio_timestamp: null, segment_start_seconds: 5 },
  ]
  const filename = path.resolve(__dirname, '../src/lib/luxorCallsServer.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const transpileTs = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loadTs = (file, parent) => {
    const child = new Module(file, parent); child.filename = file; child.paths = Module._nodeModulePaths(path.dirname(file))
    const orig = child.require.bind(child)
    child.require = (n) => (n === 'server-only' ? {} : orig(n))
    child._compile(transpileTs(file), file)
    return child.exports
  }
  mod.require = (name) => {
    if (name === 'server-only') return {}
    if (name === './luxorCallTypes') return loadTs(path.resolve(__dirname, '../src/lib/luxorCallTypes.ts'), mod)
    if (name === './luxorElenaLiveTranscriptSnapshot') return loadTs(path.resolve(__dirname, '../src/lib/luxorElenaLiveTranscriptSnapshot.ts'), mod)
    if (name === './supabaseRestServer') return {
      supabaseRest: async (query) => {
        if (query.startsWith('luxor_calls?')) return [call]
        if (query.includes('luxor_call_transcript_segments')) return rawRows
        return []
      },
    }
    if (name === './luxorInquiriesServer') return { listLuxorInquiries: async () => [] }
    return Module.prototype.require.call(mod, name)
  }
  mod._compile(transpileTs(filename), filename)
  const segments = await mod.exports.getLuxorTranscriptSegments(callId)
  assert.deepEqual(segments.map((row) => row.segment_text), ['hello', 'Luxor at Las Palmas'])
})

test('getLuxorTranscriptSegments repairs thin post_call frozen snapshot from raw ASR', async () => {
  const callId = 'call-id'
  const call = {
    id: callId,
    recording_started_at: '2026-11-14T19:25:00.000Z',
    transcript_segments: [
      { id: 'snap-c', track: 'caller', text: 'hello', originalText: 'hello', timestamp: '2026-11-14T19:25:01.000Z', startSeconds: 1, final: true, spokenLanguages: [], translationStatus: 'not_requested' },
      { id: 'snap-e', track: 'luxor_agent', text: 'last only', originalText: 'last only', timestamp: '2026-11-14T19:26:30.000Z', startSeconds: 90, final: true, spokenLanguages: [], translationStatus: 'not_requested' },
    ],
    metadata: { scope: 'elena_live_inbound', agent_transcript_sideband: 'completed', transcript_source: 'post_call' },
  }
  const rawRows = [
    { id: '1', call_id: callId, transcription_sid: 'GT123', sequence_id: 1, track: 'caller', segment_text: 'hello', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:01.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 },
    { id: '2', call_id: callId, transcription_sid: MODEL_SID, sequence_id: 2, track: 'luxor_agent', segment_text: 'last only', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:26:30.000Z', segment_audio_timestamp: null, segment_start_seconds: 90 },
    { id: '3', call_id: callId, transcription_sid: 'GT123', sequence_id: 3, track: 'luxor_agent', segment_text: 'greeting', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:05.000Z', segment_audio_timestamp: null, segment_start_seconds: 5 },
    { id: '4', call_id: callId, transcription_sid: 'GT123', sequence_id: 4, track: 'luxor_agent', segment_text: 'middle', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:40.000Z', segment_audio_timestamp: null, segment_start_seconds: 40 },
  ]
  const filename = path.resolve(__dirname, '../src/lib/luxorCallsServer.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const transpileTs = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loadTs = (file, parent) => {
    const child = new Module(file, parent); child.filename = file; child.paths = Module._nodeModulePaths(path.dirname(file))
    const orig = child.require.bind(child)
    child.require = (n) => (n === 'server-only' ? {} : orig(n))
    child._compile(transpileTs(file), file)
    return child.exports
  }
  mod.require = (name) => {
    if (name === 'server-only') return {}
    if (name === './luxorCallTypes') return loadTs(path.resolve(__dirname, '../src/lib/luxorCallTypes.ts'), mod)
    if (name === './luxorElenaLiveTranscriptSnapshot') return loadTs(path.resolve(__dirname, '../src/lib/luxorElenaLiveTranscriptSnapshot.ts'), mod)
    if (name === './supabaseRestServer') return {
      supabaseRest: async (query) => {
        if (query.startsWith('luxor_calls?')) return [call]
        if (query.includes('luxor_call_transcript_segments')) return rawRows
        return []
      },
    }
    if (name === './luxorInquiriesServer') return { listLuxorInquiries: async () => [] }
    return Module.prototype.require.call(mod, name)
  }
  mod._compile(transpileTs(filename), filename)
  const segments = await mod.exports.getLuxorTranscriptSegments(callId)
  assert.deepEqual(segments.map((row) => row.segment_text), ['hello', 'greeting', 'middle'])
})

test('getLuxorTranscriptSegments keeps manual post_call snapshot untouched', async () => {
  const callId = 'call-id'
  const call = {
    id: callId,
    recording_started_at: '2026-11-14T19:25:00.000Z',
    transcript_segments: [
      { id: 'snap-e', track: 'luxor_agent', text: 'edited greeting', originalText: 'edited greeting', timestamp: '2026-11-14T19:25:05.000Z', startSeconds: 5, final: true, spokenLanguages: [], translationStatus: 'not_requested' },
    ],
    metadata: { scope: 'elena_live_inbound', agent_transcript_sideband: 'completed', transcript_source: 'post_call', transcript_manually_corrected: true },
  }
  const rawRows = [
    { id: '2', call_id: callId, transcription_sid: 'GT123', sequence_id: 2, track: 'luxor_agent', segment_text: 'ASR only', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:05.000Z', segment_audio_timestamp: null, segment_start_seconds: 5 },
    { id: '3', call_id: callId, transcription_sid: MODEL_SID, sequence_id: 3, track: 'luxor_agent', segment_text: 'model', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T19:25:05.000Z', segment_audio_timestamp: null, segment_start_seconds: 5 },
  ]
  const filename = path.resolve(__dirname, '../src/lib/luxorCallsServer.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const transpileTs = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loadTs = (file, parent) => {
    const child = new Module(file, parent); child.filename = file; child.paths = Module._nodeModulePaths(path.dirname(file))
    const orig = child.require.bind(child)
    child.require = (n) => (n === 'server-only' ? {} : orig(n))
    child._compile(transpileTs(file), file)
    return child.exports
  }
  mod.require = (name) => {
    if (name === 'server-only') return {}
    if (name === './luxorCallTypes') return loadTs(path.resolve(__dirname, '../src/lib/luxorCallTypes.ts'), mod)
    if (name === './luxorElenaLiveTranscriptSnapshot') return loadTs(path.resolve(__dirname, '../src/lib/luxorElenaLiveTranscriptSnapshot.ts'), mod)
    if (name === './supabaseRestServer') return {
      supabaseRest: async (query) => {
        if (query.startsWith('luxor_calls?')) return [call]
        if (query.includes('luxor_call_transcript_segments')) return rawRows
        return []
      },
    }
    if (name === './luxorInquiriesServer') return { listLuxorInquiries: async () => [] }
    return Module.prototype.require.call(mod, name)
  }
  mod._compile(transpileTs(filename), filename)
  const segments = await mod.exports.getLuxorTranscriptSegments(callId)
  assert.deepEqual(segments.map((row) => row.segment_text), ['edited greeting'])
})

test('elena agent segments store model output as final luxor_agent rows', async () => {
  const { exports, inserted } = loadCallsServer()
  await exports.saveLuxorElenaAgentTranscriptSegment({
    callSid: 'CA' + '1'.repeat(32), sessionId: 'live_session', text: 'Luxor at Las Palmas hosts beautiful quinceañeras.', startMs: 1200, endMs: 4800, sequenceId: 1,
  })
  await exports.saveLuxorElenaAgentTranscriptSegment({
    callSid: 'CA' + '1'.repeat(32), sessionId: 'live_session', text: 'Tell me about your guest count.', startMs: 5200, endMs: 9000, sequenceId: 2,
  })
  const segments = inserted.filter((row) => row.query.startsWith('luxor_call_transcript_segments')).map((row) => row.body)
  assert.equal(segments.length, 2)
  assert.deepEqual(segments.map((row) => row.sequence_id), [1, 2])
  assert.equal(segments[0].track, 'luxor_agent')
  assert.equal(segments[0].is_final, true)
  assert.equal(segments[0].transcription_sid, MODEL_SID)
  assert.match(segments[0].segment_text, /Luxor at Las Palmas/)
})