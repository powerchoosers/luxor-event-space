/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const callId = '00000000-0000-4000-8000-000000000001'
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

function loadServer({ supabaseRest }) {
  return compile('src/lib/luxorCallsServer.ts', {
    'server-only': {},
    './luxorCallTypes': compile('src/lib/luxorCallTypes.ts', { 'server-only': {} }),
    './supabaseRestServer': { supabaseRest },
    './luxorInquiriesServer': { listLuxorInquiries: async () => [] },
  })
}

test('raw transcript queries only request final segments', async () => {
  const queries = []
  const rows = [
    { id: 'final-1', call_id: callId, sequence_id: 1, track: 'caller', segment_text: 'Hello', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T12:00:01.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 },
  ]
  const server = loadServer({
    supabaseRest: async (query) => {
      queries.push(query)
      if (query.startsWith('luxor_calls?')) {
        return [{ id: callId, recording_started_at: '2026-11-14T12:00:00.000Z', transcript_segments: [], metadata: {}, created_at: '2026-11-14T12:00:00.000Z', updated_at: '2026-11-14T12:00:00.000Z' }]
      }
      return rows
    },
  })

  const segments = await server.getLuxorTranscriptSegments(callId)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].segment_text, 'Hello')
  assert.ok(queries.some((query) => query.includes('luxor_call_transcript_segments') && query.includes('is_final=eq.true')))
})

test('list and detail views keep post-call transcript snapshots', async () => {
  const postCall = [
    { id: 'pc-1', text: 'Corrected live line', originalText: 'Live line', track: 'caller', timestamp: '2026-11-14T12:00:05.000Z', final: true, startSeconds: 5 },
  ]
  const postCallCall = {
    id: callId,
    twilio_call_sid: 'CA' + '3'.repeat(32),
    direction: 'inbound',
    status: 'completed',
    recording_consent_status: 'automatic',
    recording_started_at: '2026-11-14T12:00:00.000Z',
    transcription_status: 'completed',
    transcript_segments: postCall,
    metadata: { scope: 'elena_live_inbound', transcript_source: 'post_call' },
    created_at: '2026-11-14T12:00:00.000Z',
    updated_at: '2026-11-14T12:00:00.000Z',
    last_sequence_number: 0,
  }
  let transcriptSnapshotPatchCount = 0
  const server = loadServer({
    supabaseRest: async (query, init = {}) => {
      if (query.startsWith('luxor_call_transcript_segments')) {
        return [{ id: 'live-1', call_id: callId, sequence_id: 1, track: 'caller', segment_text: 'Live line', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T12:00:01.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 }]
      }
      if (query.startsWith('luxor_calls?') && init.method === 'PATCH') {
        const body = JSON.parse(init.body)
        if (Object.hasOwn(body, 'transcript_segments')) transcriptSnapshotPatchCount += 1
        Object.assign(postCallCall, body)
        return [structuredClone(postCallCall)]
      }
      if (query.startsWith('luxor_calls?')) return [structuredClone(postCallCall)]
      return []
    },
  })

  const listed = await server.listLuxorCalls({ limit: 10 })
  assert.deepEqual(listed[0].transcript_segments, postCall)
  await server.saveLuxorTranscriptEvent({
    callSid: 'CA' + '3'.repeat(32),
    event: 'transcription-content',
    sequenceId: 2,
    transcriptionSid: 'GT' + '3'.repeat(32),
    transcriptionData: JSON.stringify({ transcript: 'New live', track: 'caller' }),
    final: 'true',
  })
  assert.equal(transcriptSnapshotPatchCount, 0)
})

test('list and detail views keep manually corrected transcript snapshots', async () => {
  const corrected = [
    { id: 'edited-1', text: 'Corrected line', track: 'caller', timestamp: '2026-11-14T12:00:05.000Z', final: true, startSeconds: 5 },
  ]
  const manualCall = {
    id: callId,
    twilio_call_sid: 'CA' + '1'.repeat(32),
    direction: 'inbound',
    status: 'completed',
    recording_consent_status: 'consented',
    recording_started_at: '2026-11-14T12:00:00.000Z',
    transcription_status: 'pending',
    transcript_segments: corrected,
    metadata: { transcript_manually_corrected: true },
    created_at: '2026-11-14T12:00:00.000Z',
    updated_at: '2026-11-14T12:00:00.000Z',
    last_sequence_number: 0,
  }
  let transcriptSnapshotPatchCount = 0
  const server = loadServer({
    supabaseRest: async (query, init = {}) => {
      if (query.startsWith('luxor_call_transcript_segments')) {
        return [
          { id: 'partial-1', call_id: callId, sequence_id: 1, track: 'caller', segment_text: 'Partial', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T12:00:01.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 },
          { id: 'final-1', call_id: callId, sequence_id: 1, track: 'caller', segment_text: 'Final', english_text: null, spoken_languages: [], translation_status: 'not_requested', event_timestamp: '2026-11-14T12:00:02.000Z', segment_audio_timestamp: null, segment_start_seconds: 1 },
        ]
      }
      if (query.startsWith('luxor_calls?') && init.method === 'PATCH') {
        const body = JSON.parse(init.body)
        if (Object.hasOwn(body, 'transcript_segments')) transcriptSnapshotPatchCount += 1
        Object.assign(manualCall, body)
        return [structuredClone(manualCall)]
      }
      if (query.startsWith('luxor_calls?')) return [structuredClone(manualCall)]
      return []
    },
  })

  const listed = await server.listLuxorCalls({ limit: 10 })
  assert.deepEqual(listed[0].transcript_segments, corrected)

  const detail = await server.getLuxorTranscriptSegments(callId)
  assert.equal(detail.length, 1)
  assert.equal(detail[0].segment_text, 'Corrected line')

  await server.saveLuxorTranscriptEvent({
    callSid: 'CA' + '1'.repeat(32),
    event: 'transcription-content',
    sequenceId: 2,
    transcriptionSid: 'GT' + '2'.repeat(32),
    transcriptionData: JSON.stringify({ transcript: 'New partial', track: 'caller' }),
    final: 'false',
  })
  assert.equal(transcriptSnapshotPatchCount, 0)
})