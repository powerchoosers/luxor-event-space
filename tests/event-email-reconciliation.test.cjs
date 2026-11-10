'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let pending, booking, inquiry, failSync, deletes, requests, deferrals, queryPath
const file = path.resolve(__dirname, '../src/lib/luxorBookingEmailAutomationsServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
class RestError extends Error {}
const mocks = {
  './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (query, options = {}) => {
    if (query.startsWith('luxor_event_email_reconciliation?select=')) { queryPath = query; return pending }
    if (query.startsWith('luxor_event_email_reconciliation?booking_id=')) { if (options.method === 'PATCH') deferrals.push({ query, body: JSON.parse(options.body) }); else deletes.push(query); return null }
    if (query.startsWith('luxor_bookings?')) return booking ? [booking] : []
    if (query.startsWith('luxor_inquiries?')) return inquiry ? [inquiry] : []
    if (query === 'rpc/luxor_sync_event_email_reminders') { requests.push(JSON.parse(options.body)); if (failSync) throw new Error('unavailable'); return [{ applied: true }] }
    throw new Error('Unexpected request')
  } },
  './luxorEmailJobsServer': { cancelQueuedLuxorEmailJobs: async () => { throw new Error('Unexpected unrelated cancellation') }, createUniqueLuxorEmailJob: async () => { throw new Error('Unexpected fallback') } },
  './luxorEventEmailCopyServer': { readEventEmailSettings: async () => ({ settings: [] }) },
  './luxorLifecycleEmailsServer': { buildEventEmail: ({ kind }) => ({ subject: kind, body: kind }), lifecycleAutomationKey: () => 'key' },
}
mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { pending = [{ booking_id: 'booking', generation: 'generation' }]; booking = { id: 'booking', inquiry_id: 'inquiry', event_date: '2099-12-10', status: 'confirmed', metadata: { planning_completed_at: '2026-01-01', final_payment_paid_at: '2026-01-01' } }; inquiry = { id: 'inquiry', email: 'sample@example.invalid', status: 'booked' }; failSync = false; deletes = []; requests = []; deferrals = []; queryPath = '' }
test('retries the current booking and acknowledges only its observed generation', async () => {
  reset(); const result = await mod.exports.reconcileEventEmailReminders()
  assert.equal(result.completed, 1); assert.equal(requests[0].p_expected_date, '2099-12-10'); assert.match(deletes[0], /generation=eq\.generation/); assert.match(queryPath, /next_attempt_at=lte\./)
})
test('failed scheduling or missing recipient stays pending; cancelled bookings retire their generation', async () => {
  const previous = console.warn; console.warn = () => {}
  try {
    reset(); failSync = true; assert.equal((await mod.exports.reconcileEventEmailReminders()).completed, 0); assert.equal(deletes.length, 0); assert.match(deferrals[0].query, /generation=eq\.generation/); assert.ok(Date.parse(deferrals[0].body.next_attempt_at) > Date.now() + 240000)
    reset(); inquiry.email = null; assert.equal((await mod.exports.reconcileEventEmailReminders()).completed, 0); assert.equal(deletes.length, 0); assert.equal(deferrals.length, 1)
    reset(); booking.status = 'cancelled'; assert.equal((await mod.exports.reconcileEventEmailReminders()).completed, 1); assert.equal(requests.length, 0)
  } finally { console.warn = previous }
})
