'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let booking, failRead, patches
const file = path.resolve(__dirname, '../src/lib/luxorEmailJobsServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
mod.require = (name) => name === './supabaseRestServer' ? {
  supabaseRestStrict: async (query) => { assert.match(query, /id=eq\.booking&inquiry_id=eq\.inquiry/); if (failRead) throw new Error('read failed'); return booking ? [booking] : [] },
  supabaseRest: async (query, options) => { patches.push({ query, body: JSON.parse(options.body) }); return [] },
} : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const job = { id: 'job', booking_id: 'booking', inquiry_id: 'inquiry', job_type: 'event_details_reminder', metadata: { event_date: '2099-12-10' } }
function reset() { booking = { id: 'booking', inquiry_id: 'inquiry', status: 'confirmed', event_date: '2099-12-10' }; failRead = false; patches = [] }
test('matching active booking remains eligible', async () => { reset(); assert.equal(await mod.exports.cancelIneligibleEventEmail(job), false); assert.equal(patches.length, 0) })
test('changed date, cancelled and completed bookings stop the claimed reminder', async () => {
  for (const change of [{ event_date: '2099-12-11' }, { status: 'cancelled' }, { status: 'completed' }]) {
    reset(); booking = { ...booking, ...change }; assert.equal(await mod.exports.cancelIneligibleEventEmail(job), true)
    assert.match(patches[0].query, /id=eq\.job&status=eq\.sending/); assert.equal(patches[0].body.status, 'cancelled')
  }
})
test('failed reads and missing original dates hold the message rather than sending it', async () => {
  reset(); failRead = true; await assert.rejects(mod.exports.cancelIneligibleEventEmail(job), /held.*verified/); assert.equal(patches.length, 0)
  reset(); await assert.rejects(mod.exports.cancelIneligibleEventEmail({ ...job, metadata: {} }), /original event date is missing/); assert.equal(patches.length, 0)
})
test('corrected resends and unrelated messages keep their existing separate handling', async () => {
  reset(); assert.equal(await mod.exports.cancelIneligibleEventEmail({ ...job, metadata: { corrected_email_resend_request_id: 'request' } }), false)
  assert.equal(await mod.exports.cancelIneligibleEventEmail({ ...job, job_type: 'marketing_campaign' }), false); assert.equal(patches.length, 0)
})
test('post-event email is stopped for a cancelled booking', async () => {
  reset(); booking.status = 'cancelled'; assert.equal(await mod.exports.cancelIneligibleEventEmail({ ...job, job_type: 'post_event_follow_up', metadata: {} }), true)
  assert.match(patches[0].body.last_error, /cancelled/)
})
