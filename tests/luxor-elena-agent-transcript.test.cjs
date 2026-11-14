/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

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

test('elena live inbound still stores agent ASR rows for fallback', async () => {
  const { exports, inserted } = loadCallsServer()
  await exports.saveLuxorTranscriptEvent({
    callSid: 'CA' + '1'.repeat(32), event: 'transcription-content', sequenceId: 11, transcriptionSid: 'GT' + '4'.repeat(32),
    transcriptionData: JSON.stringify({ track: 'inbound_track', transcript: 'Luzor pricing' }), final: 'true',
  })
  const segment = inserted.find((row) => row.query.startsWith('luxor_call_transcript_segments'))?.body
  assert.equal(segment.track, 'luxor_agent')
})

test('snapshot prefers model agent rows when present', () => {
  const { exports } = loadCallsServer()
  const call = { id: 'call-id', metadata: { scope: 'elena_live_inbound' } }
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'ASR Luzor' },
    { track: 'luxor_agent', transcription_sid: exports.ELENA_LIVE_AGENT_TRANSCRIPTION_SID, segment_text: 'Luxor at Las Palmas' },
  ]
  const selected = exports.elenaLiveSnapshotTranscriptRows(call, rows)
  assert.deepEqual(selected.map((row) => row.segment_text), ['hello', 'Luxor at Las Palmas'])
})

test('snapshot falls back to agent ASR when no model rows exist', () => {
  const { exports } = loadCallsServer()
  const call = { id: 'call-id', metadata: { scope: 'elena_live_inbound' } }
  const rows = [
    { track: 'caller', transcription_sid: 'GT123', segment_text: 'hello' },
    { track: 'luxor_agent', transcription_sid: 'GT123', segment_text: 'ASR only' },
  ]
  assert.equal(exports.elenaLiveSnapshotTranscriptRows(call, rows).length, 2)
})

test('elena agent segments store model output as final luxor_agent rows', async () => {
  const { exports, inserted } = loadCallsServer()
  await exports.saveLuxorElenaAgentTranscriptSegment({
    callSid: 'CA' + '1'.repeat(32), sessionId: 'live_session', text: 'Luxor at Las Palmas hosts beautiful quinceañeras.', startMs: 1200, endMs: 4800,
  })
  const segment = inserted.find((row) => row.query.startsWith('luxor_call_transcript_segments'))?.body
  assert.equal(segment.track, 'luxor_agent')
  assert.equal(segment.is_final, true)
  assert.equal(segment.transcription_sid, 'elena_live_model_output')
  assert.match(segment.segment_text, /Luxor at Las Palmas/)
})