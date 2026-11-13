/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/luxorTranscriptTranslationServer.ts')
function load(database) {
  const loaded = new Module(filename, module); loaded.filename = filename
  loaded.require = name => name === 'server-only' ? {} : name === './supabaseRestServer' ? { supabaseRestStrict: database } : require(name)
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return loaded.exports
}
test('validates bounded translations and preserves uncertain language as empty', () => {
  const { parseTranscriptTranslation: parse } = load()
  assert.deepEqual(parse({ english: 'Hello', languages: [] }), { english: 'Hello', languages: [] })
  assert.deepEqual(parse({ english: 'Hello', languages: ['Arabic', 'Arabic'] }).languages, ['Arabic'])
  for (const value of [null, {}, { english: '', languages: [] }, { english: 'a', languages: ['<script>'] }, { english: 'a', languages: 'Arabic' }]) assert.throws(() => parse(value))
})
test('claims once, retains source, and persists translated result without customer mutations', async () => {
  const writes = [], row = { id: 'id', call_id: 'call', segment_text: 'مرحبا', translation_attempts: 0, translation_status: 'pending', translation_updated_at: null }
  const db = async (query, init = {}) => {
    if (!init.method) return query.startsWith('luxor_calls?') ? [{ recording_consent_status: 'automatic', metadata: { scope: 'elena_live_inbound' } }] : [row]
    const body = JSON.parse(init.body); writes.push({ query, body }); return query.includes('select=id') ? [{ id: 'id' }] : null
  }
  const old = global.fetch; process.env.OPENAI_API_KEY = 'synthetic-test-key'
  global.fetch = async (_, init) => { assert.equal(JSON.parse(init.body).store, false); return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ english: 'Hello', languages: ['Arabic'] }) }] }] }) } }
  try { await load(db).processPendingLuxorTranscriptTranslations(2) } finally { global.fetch = old; delete process.env.OPENAI_API_KEY }
  assert.ok(writes.some(v => v.body.english_text === 'Hello'))
  assert.ok(writes.every(v => v.body.segment_text === undefined && !v.query.includes('inquiries')))
})
test('revoked/non-live processing eligibility makes no provider request', async () => {
  let calls = 0; const old = global.fetch; global.fetch = async () => { calls++; throw Error('must not run') }
  const writes = []
  try { await load(async (query, init = {}) => {
    if (init.method) { writes.push(JSON.parse(init.body)); return [] }
    return query.startsWith('luxor_calls?') ? [{ recording_consent_status: 'declined', metadata: { scope: 'elena_live_inbound' } }] : [{ id: 'id', call_id: 'call', translation_status: 'pending' }]
  }).processPendingLuxorTranscriptTranslations() } finally { global.fetch = old }
  assert.equal(calls, 0); assert.equal(writes[0].translation_status, 'not_requested')
})
test('provider failure remains retryable then visibly fails at attempt three', async () => {
  for (const attempts of [0, 2]) {
    const writes = []; const old = global.fetch; global.fetch = async () => { throw Error('synthetic timeout') }; process.env.OPENAI_API_KEY = 'synthetic-test-key'
    try { await load(async (query, init = {}) => {
      if (!init.method) return query.startsWith('luxor_calls?') ? [{ recording_consent_status: 'automatic', metadata: { scope: 'elena_live_inbound' } }] : [{ id: 'id', call_id: 'call', segment_text: 'مرحبا', translation_attempts: attempts, translation_status: 'pending', translation_updated_at: null }]
      writes.push(JSON.parse(init.body)); return query.includes('select=id') ? [{ id: 'id' }] : null
    }).processPendingLuxorTranscriptTranslations() } finally { global.fetch = old; delete process.env.OPENAI_API_KEY }
    assert.equal(writes[1].translation_status, attempts === 0 ? 'pending' : 'failed')
  }
})
test('lost lease never calls translation provider', async () => {
  const old = global.fetch; global.fetch = async () => { throw Error('must not call') }
  try { await load(async (query, init = {}) => !init.method ? query.startsWith('luxor_calls?') ? [{ recording_consent_status: 'automatic', metadata: { scope: 'elena_live_inbound' } }] : [{ id: 'id', call_id: 'call', translation_attempts: 0, translation_status: 'pending', translation_updated_at: null }] : []).processPendingLuxorTranscriptTranslations() } finally { global.fetch = old }
})
test('live ASR enables multilingual transcription, not English telephony', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/luxorElenaInboundRecordingServer.ts'), 'utf8')
  assert.match(source, /transcriptionEngine: 'deepgram', speechModel: 'nova-3', languageCode: 'multi'/)
})
