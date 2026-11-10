'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let invoice, payments, failTable
const file = path.resolve(__dirname, '../src/lib/luxorEmailJobsServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
mod.require = (name) => name === './supabaseRestServer' ? {
  supabaseRestStrict: async (query) => {
    const table = query.startsWith('luxor_invoices?') ? 'invoice' : 'payment'
    if (failTable === table) throw new Error('database unavailable')
    return table === 'invoice' ? (invoice ? [invoice] : []) : payments
  },
} : name === './luxorOffer' ? { isLuxorOfferExpired: (value) => value.expired } : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
function reset() { invoice = { status: 'sent', expired: false }; payments = []; failTable = null }
test('an active unpaid offer remains eligible', async () => { reset(); assert.equal(await mod.exports.isOfferReminderIneligible('invoice'), false) })
test('paid, expired, cancelled or missing offers are ineligible', async () => {
  for (const state of [{ status: 'paid' }, { status: 'cancelled' }, { status: 'sent', expired: true }, null]) { reset(); invoice = state; assert.equal(await mod.exports.isOfferReminderIneligible('invoice'), true) }
  reset(); payments = [{ id: 'paid' }]; assert.equal(await mod.exports.isOfferReminderIneligible('invoice'), true)
})
test('invoice and payment read failures hold instead of treating the offer as unpaid', async () => {
  for (const table of ['invoice', 'payment']) { reset(); failTable = table; await assert.rejects(mod.exports.isOfferReminderIneligible('invoice'), /held.*verified/) }
})
