'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const model = load('src/lib/luxorEventEmailCopy.ts'), design = load('src/lib/luxorEmailDesignSystem.ts')
const lifecycle = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorEventEmailCopy': model, './luxorEmailDesignSystem': design })
let settings, failed, reads, jobs, cancels, rpcCalls, rpcMissing
class RestError extends Error { constructor(status, code) { super('RPC unavailable'); this.status = status; this.code = code } }
const scheduler = load('src/lib/luxorBookingEmailAutomationsServer.ts', {
  './luxorLifecycleEmailsServer': lifecycle,
  './luxorEventEmailCopyServer': { readEventEmailSettings: async () => { reads++; if (failed) throw new Error('synthetic outage'); return { settings } } },
  './luxorEmailJobsServer': { cancelQueuedLuxorEmailJobs: async (...args) => { cancels.push(args) }, createUniqueLuxorEmailJob: async (job) => { if (!jobs.has(job.automationKey)) jobs.set(job.automationKey, job); return jobs.get(job.automationKey) } },
  './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (_path, options) => { rpcCalls.push(JSON.parse(options.body)); if (rpcMissing) throw new RestError(404, 'PGRST202'); return [{ applied: true, queued: 2, cancelled: 0 }] } },
})
const inquiry = { id: 'inquiry', email: 'sample@example.invalid', full_name: 'Sample Guest', event_type: 'Wedding' }
const booking = { id: 'booking', event_date: '2099-12-10', metadata: { planning_completed_at: '2026-01-01' } }
function reset() { settings = model.EVENT_EMAIL_KEYS.map((key) => ({ key, copy_override: null })); failed = false; reads = 0; jobs = new Map(); cancels = []; rpcCalls = []; rpcMissing = true }
test('planning transition queues separate saved copies at the existing times and preserves snapshots', async () => {
  reset(); settings = settings.map((item) => item.key === 'details' ? { ...item, copy_override: { ...model.EVENT_EMAIL_DEFAULTS.details, body: 'Saved details for {{first_name}}' } } : item)
  await scheduler.syncBookingEmailAutomations({ inquiry, booking, previous: { ...booking, metadata: {} } })
  const entries = [...jobs.values()]; assert.equal(entries.length, 2)
  assert.deepEqual(entries.map((item) => item.scheduledFor), ['2099-11-26T17:00:00.000Z', '2099-12-08T17:00:00.000Z'])
  assert.match(entries[0].body, /Saved details for Sample/); assert.equal(entries[0].metadata.event_date, '2099-12-10')
  settings[0].copy_override.body = 'Changed wording'
  await scheduler.syncBookingEmailAutomations({ inquiry, booking, previous: { ...booking, metadata: {} } })
  assert.equal(jobs.size, 2); assert.match([...jobs.values()][0].body, /Saved details for Sample/)
  await scheduler.syncBookingEmailAutomations({ inquiry, booking, previous: booking }); assert.equal(jobs.size, 2)
})
test('event completion schedules one thank-you and a settings outage records the fallback', async () => {
  reset(); failed = true; const before = Date.now(), previousError = console.error; console.error = () => {}
  try { await scheduler.syncBookingEmailAutomations({ inquiry, booking: { ...booking, metadata: { event_completed_at: '2026-01-02' } }, previous: { ...booking, metadata: {} } }) } finally { console.error = previousError }
  const [job] = jobs.values(); assert.equal(job.jobType, 'post_event_follow_up'); assert.equal(job.metadata.copy_settings_unavailable, true)
  assert.ok(Date.parse(job.scheduledFor) >= before + 24 * 60 * 60_000); assert.match(job.body, /Thank you for choosing Luxor/)
})
test('unrelated updates do not read copy and payment completion keeps its existing cancellation', async () => {
  reset(); await scheduler.syncBookingEmailAutomations({ inquiry, booking: { ...booking, metadata: { final_payment_paid_at: '2026-01-02' } }, previous: { ...booking, metadata: {} } })
  assert.equal(reads, 0); assert.deepEqual(cancels, [['inquiry', ['final_payment_reminder']]]); assert.equal(jobs.size, 0)
})
test('date and cancellation changes alone do not reschedule existing event messages', async () => {
  reset()
  await scheduler.syncBookingEmailAutomations({ inquiry, booking: { ...booking, event_date: '2099-12-20', status: 'cancelled' }, previous: { ...booking, status: 'confirmed' } })
  assert.equal(reads, 0); assert.equal(jobs.size, 0); assert.deepEqual(cancels, [])
})
test('a changed date uses the transactional scheduler and does not fall back without it', async () => {
  reset(); rpcMissing = false
  const next = { ...booking, event_date: '2099-12-20', status: 'confirmed' }
  await scheduler.syncBookingEmailAutomations({ inquiry, booking: next, previous: { ...booking, status: 'confirmed' } })
  assert.equal(rpcCalls.length, 1); assert.equal(rpcCalls[0].p_expected_date, '2099-12-20'); assert.equal(rpcCalls[0].p_reminders.length, 2); assert.equal(jobs.size, 0)
  reset(); await assert.rejects(scheduler.syncBookingEmailAutomations({ inquiry, booking: next, previous: { ...booking, status: 'confirmed' } }), /RPC unavailable/); assert.equal(jobs.size, 0)
})
