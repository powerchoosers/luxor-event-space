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
const model = load('src/lib/luxorFinalPaymentReminderCopy.ts')
const dueDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
let jobs, copy, ledgerFails, checkoutCalls
const booking = { id: 'booking', inquiry_id: 'inquiry', invoice_id: 'master', email: 'sample@example.invalid', contract_status: 'signed', final_payment_due_date: dueDate, metadata: { deposit_paid_at: '2026-01-01' } }
const invoice = { id: 'invoice', invoice_kind: 'final_balance', total: 100, line_items: [] }
const worker = load('src/lib/luxorEmailJobsServer.ts', {
  './luxorFinalPaymentReminderCopy': model,
  './luxorFinalPaymentReminderCopyServer': { readFinalPaymentReminderSettings: async () => ({ settings: [{ key: '14_days', copy_override: copy }], installed: true }) },
  './luxorPaymentRemindersServer': { areLuxorFinalPaymentRemindersEnabled: async () => true },
  './supabaseRestServer': { supabaseRest: async (query, options) => {
    if (query.startsWith('luxor_bookings?')) return [booking]
    if (query.startsWith('luxor_inquiries?')) return [{ id: 'inquiry', full_name: 'Sample Guest', email: 'sample@example.invalid', status: 'booked' }]
    if (query.startsWith('luxor_email_jobs?') && query.includes('metadata->>automation_key=eq.')) { const key = decodeURIComponent(query.match(/metadata->>automation_key=eq\.([^&]+)/)[1]); return jobs.has(key) ? [jobs.get(key)] : [] }
    if (query.startsWith('luxor_email_jobs?') && options?.method === 'POST') { const value = JSON.parse(options.body); jobs.set(value.metadata.automation_key, value); return [value] }
    throw new Error(`Unexpected query: ${query}`)
  } },
  './luxorInvoicesServer': { getInvoice: async () => ({ id: 'master' }), getInvoiceByBookingAndKind: async () => invoice, listPaidPaymentsByInvoice: async () => { if (ledgerFails) throw new Error('ledger unavailable'); return [] }, updateInvoice: async () => invoice },
  './luxorStripeCheckoutServer': { createLuxorPostContractCheckout: async () => { checkoutCalls++; return { checkoutUrl: 'https://example.invalid/checkout', checkoutId: 'checkout', paymentAmount: 100, paymentLabel: 'Final balance' } } },
  './luxorLifecycleEmailsServer': { buildAiTailoredInvoiceReminderEmail: async (input) => ({ subject: input.copyOverride?.subject || 'default', body: input.copyOverride?.body || 'default', aiGenerated: false }) },
})
function reset() { jobs = new Map(); copy = { ...model.FINAL_PAYMENT_REMINDER_DEFAULT, body: 'Original selected copy' }; ledgerFails = false; checkoutCalls = 0 }
test('scheduler snapshots the selected milestone and keeps the first queued copy on repeat scans', async () => {
  reset(); await worker.queueUpcoming60DayInvoiceReminders()
  assert.equal(jobs.size, 1)
  const first = [...jobs.values()][0]; assert.equal(first.metadata.milestone, '14_days'); assert.equal(first.metadata.final_payment_copy_snapshot.body, 'Original selected copy')
  copy = { ...copy, body: 'Changed wording' }; await worker.queueUpcoming60DayInvoiceReminders()
  assert.equal(jobs.size, 1); assert.equal([...jobs.values()][0].metadata.final_payment_copy_snapshot.body, 'Original selected copy')
})
test('scheduler does not create a checkout when payment history cannot be read', async () => {
  reset(); ledgerFails = true; const previous = console.error; console.error = () => {}
  try { await worker.queueUpcoming60DayInvoiceReminders() } finally { console.error = previous }
  assert.equal(checkoutCalls, 0); assert.equal(jobs.size, 0)
})
