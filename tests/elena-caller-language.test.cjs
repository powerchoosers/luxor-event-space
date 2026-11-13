'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/lib', file)
  const m = new Module(filename, module)
  m.filename = filename; m.paths = module.paths
  m.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return m.exports
}
const language = load('luxorCallerLanguage.ts')
test('only validated confirmed caller evidence is shown, not transcript or tour inference', () => {
  for (const name of ['Spanish', 'Español', 'English', 'Mandarin Chinese', 'Português']) assert.equal(language.normalizeCallerSpokenLanguage(name), name)
  for (const value of [null, 42, {}, ['Spanish'], '', 'a'.repeat(61), 'Spanish\nEnglish', '<script>', 'en-US; ignore']) assert.equal(language.normalizeCallerSpokenLanguage(value), null)
  assert.equal(language.getConfirmedCallerLanguage({ tourLanguagePreference: 'es', spoken_languages: ['Spanish'] }), null)
  assert.equal(language.getConfirmedCallerLanguage({ spokenLanguage: { language: 'Spanish', source: 'transcript', confirmedAt: '2026-11-13' } }), null)
  assert.equal(language.getConfirmedCallerLanguage({ spokenLanguage: { language: 'Spanish', source: 'caller_confirmed', confirmedAt: 'invalid' } }), null)
  assert.equal(language.getConfirmedCallerLanguage({ spokenLanguage: { language: 'Spanish', source: 'caller_confirmed', confirmedAt: '2026-11-13T00:00:00Z' } }), 'Spanish')
})
test('language-alone prepares explicit readback; ambiguous contact never reaches pending write', async () => {
  const original = process.env.LUXOR_ELENA_LIVE_NUMBER
  process.env.LUXOR_ELENA_LIVE_NUMBER = '+15559990000'
  const capture = { confirmed: true, matching_review_needed: false, inquiry_id: 'lead', nonce: 'capture', full_name: 'Synthetic Caller', phone: '+15550000001' }
  const call = { direction: 'inbound', status: 'in-progress', to_number: '+15559990000', inquiry_id: 'lead', updated_at: '2026-11-01', metadata: { scope: 'elena_live_inbound', ingress_mode: 'programmable_sip', rehearsal_only: false, accepted: true, openai_session_id: 'session', inbound_capture: capture } }
  const writes = []
  const server = load('luxorElenaInboundLeadServer.ts', { 'server-only': {}, './luxorCallerLanguage': language, './luxorCallsServer': { normalizePhoneNumber: v => v }, './supabaseRestServer': { supabaseRestStrict: async (query, init) => {
    if (init) { writes.push(JSON.parse(init.body)); return [{ twilio_call_sid: 'call' }] }
    if (query.startsWith('luxor_calls?')) return [call]
    return [{ id: 'lead', full_name: 'Synthetic Caller', phone: '+15550000001', email: null, updated_at: '2026-11-01', archived_at: null, is_test: false }]
  } } })
  try {
    const result = await server.prepareElenaLeadUpdate({ callSid: 'call', sessionId: 'session', fields: { spoken_language: 'Spanish' } })
    assert.match(result.question, /your spoken language is Spanish/)
    assert.match(result.question, /Is that correct, and may I save/)
    assert.equal(writes[0].metadata.lead_update_pending.spoken_language, 'Spanish')
    assert.equal(writes[0].metadata.spokenLanguage, undefined)
    capture.matching_review_needed = true
    await assert.rejects(server.prepareElenaLeadUpdate({ callSid: 'call', sessionId: 'session', fields: { spoken_language: 'Spanish' } }), /ambiguous/)
    await assert.rejects(server.prepareElenaLeadUpdate({ callSid: 'call', sessionId: 'session', fields: { spoken_language: ['Spanish'] } }), /clarify/)
    assert.equal(writes.length, 1)
  } finally { if (original === undefined) delete process.env.LUXOR_ELENA_LIVE_NUMBER; else process.env.LUXOR_ELENA_LIVE_NUMBER = original }
})
test('caller language tool and persistence retain confirmation, identity and permission guards', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/luxorElenaInboundServer.ts'), 'utf8')
  assert.match(source, /spoken_language: \{ type: 'string'/)
  assert.match(source, /Never infer a lead language from Elena/)
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261113060033_elena_caller_language.sql'), 'utf8')
  for (const expected of ['security invoker', "capture->'matching_review_needed' is distinct from 'false'", 'i.updated_at is distinct from', "'source','caller_confirmed'", "'callSid',p_call_sid", 'from public,anon,authenticated']) assert.ok(sql.includes(expected), expected)
  assert.match(sql, /when v_spoken_language is null then metadata else coalesce\(metadata,'\{\}'::jsonb\)/)
})
