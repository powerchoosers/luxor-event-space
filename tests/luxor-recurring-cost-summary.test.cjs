/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve('src/lib/luxorRecurringCostSummaryServer.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
let handler
const original = Module._load
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
Module._load = function(request, parent, main) { return request === '@/lib/supabaseRestServer' ? { supabaseRestStrict: (...args) => handler(...args) } : original.call(this, request, parent, main) }
try { loaded._compile(code, filename) } finally { Module._load = original }
const { processRecurringCostSummaries } = loaded.exports
const candidate = { template_id: 'template', source_bill_id: 'bill', source_fingerprint: 'fingerprint', source_updated_at: '2026-01-01', occurrence_id: 'occurrence', occurrence_updated_at: '2026-01-02', provider: 'Utility', service: 'Internet phone 555-555-1234', category: 'Utilities' }
async function run({ claim = true, stale = false, model = 'Internet service for Utility.' } = {}) {
 const oldFetch = global.fetch, oldKey = process.env.OPEN_ROUTER_API_KEY, writes = []; let prompt = ''
 process.env.OPEN_ROUTER_API_KEY = 'synthetic'
 handler = async (url, options) => {
   if (url === 'rpc/luxor_autolink_recurring_profile_bills') return 0
   if (url === 'rpc/luxor_recurring_summary_candidates') return [candidate]
   if (url === 'rpc/luxor_claim_recurring_summary') return claim
   if (url.startsWith('luxor_bills?')) return stale ? [] : [{ id: 'bill' }]
   if (url.startsWith('luxor_booking_expenses?')) return [{ id: 'occurrence' }]
   if (url.startsWith('luxor_recurring_cost_ai_summaries?')) { writes.push(JSON.parse(options.body)); return [{ template_id: 'template' }] }
   throw new Error('Unexpected request')
 }
 global.fetch = async (_, options) => { prompt = options.body; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: model }) } }] }) } }
 try { return { result: await processRecurringCostSummaries(), writes, prompt } }
 finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = oldKey }
}
test('saves only bounded summary and redacts contact details from AI input', async () => { const r = await run(); assert.equal(r.result.processed, 1); assert.doesNotMatch(r.prompt, /555-555-1234/); assert.equal(r.writes[0].source_bill_id, 'bill'); assert.equal(r.writes[0].summary, 'Internet service for Utility.') })
test('lease contention skips a second generation', async () => { const r = await run({ claim: false }); assert.equal(r.result.processed, 0); assert.equal(r.writes.length, 0); assert.equal(r.prompt, '') })
test('changed source and sensitive model output never overwrite prior summary and are retried', async () => { for (const options of [{ stale: true }, { model: 'Pay $100 immediately.' }]) { const r = await run(options); assert.equal(r.result.failed, 1); assert.equal(r.writes.length, 1); assert.equal(r.writes[0].summary, undefined); assert.ok(r.writes[0].next_attempt_at) } })
