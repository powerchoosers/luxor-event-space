/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const types = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorCallTypes.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod.require = (name) => (name === 'server-only' ? {} : Module.prototype.require.call(mod, name))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
})()

const CALL_ID = 'c9ea11c8-0000-4000-8000-00000000c9ea'

const baseCall = {
  id: CALL_ID,
  created_at: '2026-11-14T12:00:00.000Z',
  updated_at: '2026-11-14T12:00:00.000Z',
  twilio_call_sid: 'CAc9ea11c800000000000000000000000',
  child_call_sid: null,
  direction: 'inbound',
  status: 'completed',
  from_number: '+12103760811',
  to_number: '+15550001111',
  caller_number: '+12103760811',
  callee_number: '+15550001111',
  inquiry_id: null,
  contact_name: 'Monica',
  owner_email: null,
  started_at: '2026-11-14T12:00:00.000Z',
  answered_at: null,
  ended_at: null,
  duration_seconds: 60,
  outcome: null,
  notes: null,
  recording_sid: null,
  recording_url: null,
  recording_duration_seconds: null,
  is_voicemail: false,
  is_read: true,
  last_sequence_number: 4,
  metadata: {},
  transcript_segments: [{ id: 'manual-1', text: 'Hand corrected line', track: 'caller', timestamp: '', final: true }],
}

test('transcript_manually_corrected metadata is recognized', () => {
  assert.equal(types.luxorCallTranscriptManuallyCorrected({ transcript_manually_corrected: true }), true)
  assert.equal(types.luxorCallTranscriptManuallyCorrected({ transcript_manually_corrected: 'true' }), true)
  assert.equal(types.luxorCallTranscriptManuallyCorrected({}), false)
})

test('syncLuxorCallTranscriptSnapshot skips hand-corrected calls and does not patch luxor_calls', async () => {
  let patchCalls = 0
  let segmentQueries = 0
  const stubs = {
    'server-only': {},
    './luxorCallTypes': types,
    './luxorInquiriesServer': { getLuxorInquiry: async () => null, listLuxorInquiries: async () => [] },
    './supabaseRestServer': {
      supabaseRest: async (url, init) => {
        if (String(url).includes('luxor_call_transcript_segments')) segmentQueries += 1
        if (init?.method === 'PATCH' && String(url).startsWith('luxor_calls?')) {
          patchCalls += 1
          return [{ ...baseCall, transcript_segments: [{ id: 'twilio-99', text: 'Would overwrite', track: 'caller', timestamp: '', final: true }] }]
        }
        return []
      },
    },
  }

  const filename = path.resolve(__dirname, '../src/lib/luxorCallsServer.ts')
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => (Object.hasOwn(stubs, name) ? stubs[name] : original(name))
  loaded._compile(js, filename)
  const { syncLuxorCallTranscriptSnapshot } = loaded.exports

  const corrected = {
    ...baseCall,
    metadata: { transcript_manually_corrected: true },
  }
  const result = await syncLuxorCallTranscriptSnapshot(corrected, 99)
  assert.equal(patchCalls, 0)
  assert.equal(segmentQueries, 0)
  assert.deepEqual(result.transcript_segments, corrected.transcript_segments)
  assert.equal(result.last_sequence_number, 4)
})