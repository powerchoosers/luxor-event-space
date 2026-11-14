/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/luxorElenaInboundRecordingServer.ts')
const callSid = 'CA' + '1'.repeat(32), accountSid = 'AC' + '2'.repeat(32), sessionId = 'live_synthetic', number = '+19563652037'
let row, calls, failRecording, failTranscription, failMetadataRead, carrierStatus, recordingPause
const db = async (query, init = {}) => {
  if (failMetadataRead && !init.method && calls.some((item) => item[0] === 'transcription')) throw Error('synthetic database outage')
  if (!init.method) return [structuredClone(row)]
  const params = new URLSearchParams(query.split('?')[1])
  if (params.get('updated_at') !== `eq.${row.updated_at}` || params.get('recording_consent_status') && params.get('recording_consent_status') !== `eq.${row.recording_consent_status}`) return []
  row = { ...row, ...JSON.parse(init.body) }
  return [structuredClone(row)]
}
const recordingApi = (sid) => ({ update: async (options) => { calls.push(['stop-recording', sid, options]) } })
recordingApi.create = async (options) => { calls.push(['recording', options]); if (recordingPause) { recordingPause.enter(); await recordingPause.wait } if (failRecording) throw Error('synthetic'); return { sid: 'RE' + '3'.repeat(32) } }
const transcriptionApi = (sid) => ({ update: async (options) => { calls.push(['stop-transcription', sid, options]) } })
transcriptionApi.create = async (options) => { calls.push(['transcription', options]); if (failTranscription) throw Error('synthetic'); return { sid: 'GT' + '4'.repeat(32) } }
const carrier = () => ({ calls: () => ({ fetch: async () => ({ accountSid, to: number, direction: 'inbound', status: carrierStatus }), recordings: recordingApi, transcriptions: transcriptionApi }) })
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
const original = loaded.require.bind(loaded)
const stubs = { 'server-only': {}, twilio: carrier, './supabaseRestServer': { supabaseRestStrict: db }, './luxorTwilioServer': { getLuxorTwilioConfig: () => ({ accountSid, authToken: 'synthetic' }) } }
loaded.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : original(name)
loaded._compile(compiled, filename)
const { prepareElenaRecording, confirmElenaRecording, startAutomaticElenaRecording, stopElenaRecording } = loaded.exports
test.beforeEach(() => {
  process.env.LUXOR_ELENA_LIVE_NUMBER = number
  row = { twilio_call_sid: callSid, direction: 'inbound', to_number: number, status: 'in-progress', recording_consent_status: 'not_requested', updated_at: '2026-11-11T12:00:00.000Z', metadata: { scope: 'elena_live_inbound', rehearsal_only: false, accepted: true, openai_session_id: sessionId } }
  calls = []; failRecording = false; failTranscription = false; failMetadataRead = false; carrierStatus = 'in-progress'; recordingPause = null
})
test('preparation records no audio and decline starts nothing', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId)
  assert.match(prepared.question, /record and transcribe/)
  assert.equal(calls.length, 0)
  const result = await confirmElenaRecording(callSid, sessionId, prepared.nonce, false)
  assert.equal(result.consented, false); assert.equal(calls.length, 0); assert.equal(row.recording_consent_status, 'declined')
})
test('confirmation starts recording and transcript once for the bound live call', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId)
  const result = await confirmElenaRecording(callSid, sessionId, prepared.nonce, true)
  assert.equal(result.recordingStarted, true); assert.equal(result.transcriptionStarted, true)
  assert.deepEqual(calls.map((item) => item[0]), ['recording', 'transcription'])
  assert.equal(calls[0][1].recordingChannels, 'dual')
  assert.equal(calls[1][1].track, 'both_tracks')
  assert.equal(calls[1][1].partialResults, true)
  assert.match(calls[1][1].hints, /quinceañera/)
  await assert.rejects(() => confirmElenaRecording(callSid, sessionId, prepared.nonce, true))
  assert.equal(calls.length, 2)
})
test('wrong session, nonce, expiry and rehearsal scope never start recording', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId)
  await assert.rejects(() => confirmElenaRecording(callSid, 'live_wrong', prepared.nonce, true))
  await assert.rejects(() => confirmElenaRecording(callSid, sessionId, 'wrong', true))
  row.metadata.recording_pending.expires_at = '2000-01-01T00:00:00.000Z'
  await assert.rejects(() => confirmElenaRecording(callSid, sessionId, prepared.nonce, true))
  row.metadata.rehearsal_only = true
  await assert.rejects(() => prepareElenaRecording(callSid, sessionId))
  assert.equal(calls.length, 0)
})
test('provider failure never claims recording or transcript is available', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId); failRecording = true
  const result = await confirmElenaRecording(callSid, sessionId, prepared.nonce, true)
  assert.equal(result.recordingStarted, false); assert.equal(result.transcriptionStarted, false)
  assert.equal(row.transcription_status, 'failed'); assert.equal(calls.length, 1)
})
test('concurrent consent confirmations start only one recording', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId)
  const results = await Promise.allSettled([confirmElenaRecording(callSid, sessionId, prepared.nonce, true), confirmElenaRecording(callSid, sessionId, prepared.nonce, true)])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(calls.filter((item) => item[0] === 'recording').length, 1)
})
test('caller may stop both recording and transcription without suppressing their eventual callbacks', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId)
  await confirmElenaRecording(callSid, sessionId, prepared.nonce, true)
  const result = await stopElenaRecording(callSid, sessionId)
  assert.equal(result.stopped, true)
  assert.deepEqual(calls.slice(2).map((item) => item[0]), ['stop-recording', 'stop-transcription'])
  assert.equal(row.recording_consent_status, 'consented')
  assert.equal(row.metadata.recording_start_status, 'stopped')
})
test('an unconfirmed transcription start does not prevent stopping the known recording', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId); failTranscription = true
  await confirmElenaRecording(callSid, sessionId, prepared.nonce, true)
  const result = await stopElenaRecording(callSid, sessionId)
  assert.equal(result.stopped, false)
  assert.equal(calls.filter((item) => item[0] === 'stop-recording').length, 1)
})
test('provider sessions are stopped if their IDs cannot be saved', async () => {
  const prepared = await prepareElenaRecording(callSid, sessionId); failMetadataRead = true
  const result = await confirmElenaRecording(callSid, sessionId, prepared.nonce, true)
  assert.equal(result.recordingStarted, false)
  assert.deepEqual(calls.slice(2).map((item) => item[0]), ['stop-recording', 'stop-transcription'])
})
test('automatic start is bound, truthful, and idempotent under concurrency', async () => {
  const results = await Promise.all([startAutomaticElenaRecording(callSid, sessionId), startAutomaticElenaRecording(callSid, sessionId)])
  assert.equal(results.some(result => result.recordingStarted), true)
  assert.equal(calls.filter(item => item[0] === 'recording').length, 1)
  assert.equal(calls.filter(item => item[0] === 'transcription').length, 1)
  assert.equal(row.recording_consent_status, 'automatic')
  assert.equal(row.recording_consent_at, null)
  assert.equal(row.metadata.recording_consent_source, 'automatic')
  assert.equal((await startAutomaticElenaRecording(callSid, sessionId)).alreadyStarted, true)
  assert.equal(calls.length, 2)
})
test('automatic start defers without claiming while parent is ringing', async () => {
  carrierStatus = 'ringing'
  const pending = await startAutomaticElenaRecording(callSid, sessionId)
  assert.equal(pending.deferred, true); assert.equal(row.recording_consent_status, 'not_requested'); assert.equal(calls.length, 0)
  carrierStatus = 'in-progress'
  assert.equal((await startAutomaticElenaRecording(callSid, sessionId)).recordingStarted, true)
})
test('a stop request while automatic startup is deferred prevents later recording', async () => {
  carrierStatus = 'ringing'
  assert.equal((await startAutomaticElenaRecording(callSid, sessionId)).deferred, true)
  assert.equal((await stopElenaRecording(callSid, sessionId)).stopped, true)
  assert.equal(row.recording_consent_status, 'declined')
  assert.equal(row.metadata.recording_consent_source, 'caller_stop_request')
  carrierStatus = 'in-progress'
  await assert.rejects(() => startAutomaticElenaRecording(callSid, sessionId))
  assert.equal(calls.length, 0)
})
test('stop requested during automatic startup is honored after identifiers are saved', async () => {
  let entered, release
  const started = new Promise(resolve => { entered = resolve })
  const wait = new Promise(resolve => { release = resolve })
  recordingPause = { enter: entered, wait }
  const start = startAutomaticElenaRecording(callSid, sessionId)
  await started
  assert.equal((await stopElenaRecording(callSid, sessionId)).stopped, false)
  release(); await start
  assert.deepEqual(calls.map(item => item[0]), ['recording', 'transcription', 'stop-recording', 'stop-transcription'])
  assert.equal(row.metadata.recording_start_status, 'stopped')
  assert.equal(row.metadata.transcription_start_status, 'stopped')
})
