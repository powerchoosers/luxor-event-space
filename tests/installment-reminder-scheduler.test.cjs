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
const model = load('src/lib/luxorInstallmentReminderCopy.ts'), design = load('src/lib/luxorEmailDesignSystem.ts')
let overrides, jobs = new Map(), paid = 0
const booking = { id: 'booking', inquiry_id: 'inquiry', invoice_id: 'master', status: 'confirmed', contract_status: 'signed', metadata: { deposit_paid_at: '2026-01-01' } }
const installment = { id: 'installment', invoice_id: 'master', label: 'Second payment', amount: 100, due_at: '2099-12-10', status: 'scheduled' }
const worker = load('src/lib/luxorEmailJobsServer.ts', {
  './luxorInstallmentReminderCopy': model, './luxorEmailDesignSystem': design,
  './luxorInstallmentReminderCopyServer': { readInstallmentReminderSettings: async () => ({ settings: overrides, installed: true }) },
  './supabaseRestServer': { supabaseRest: async (query, options) => {
    if (query.startsWith('luxor_bookings?')) return [booking]
    if (query.startsWith('luxor_inquiries?')) return [{ id: 'inquiry', full_name: 'Sample Guest', email: 'sample@example.invalid', status: 'booked', is_test: false }]
    if (query.startsWith('luxor_email_jobs?') && query.includes('status=eq.queued')) return []
    if (query.startsWith('luxor_email_jobs?') && query.includes('metadata->>automation_key=eq.')) { const key = decodeURIComponent(query.match(/metadata->>automation_key=eq\.([^&]+)/)[1]); return jobs.has(key) ? [jobs.get(key)] : [] }
    if (query.startsWith('luxor_email_jobs?') && options?.method === 'POST') { const data = JSON.parse(options.body); jobs.set(data.metadata.automation_key, data); return [data] }
    throw new Error(`Unexpected query: ${query}`)
  } },
  './luxorInvoicesServer': { getInvoice: async () => ({ id: 'master', invoice_kind: 'event' }), getInvoiceByBookingAndKind: async () => ({ id: 'final', total: 100 }), listPaidPaymentsByInvoice: async () => [], listInvoicesByBooking: async () => [] },
  './luxorPaymentInstallmentsServer': { listLuxorPaymentInstallments: async () => [installment] },
  './luxorProposalTerms': { validCalendarDate: () => true, luxorCalendarDate: () => '2099-12-01' },
  './luxorTourPlanningServer': { zonedTourDateTimeToUtc: (day) => new Date(`${day}T16:00:00Z`) },
  './luxorPaymentDashboardModel': { isBookingPaymentMilestone: () => false, isFinalPaymentMilestone: () => false, hasLuxorReminderSendWindowPassed: () => false, installmentPaidAmount: () => paid, installmentReminderAutomationKey: (_booking, _id, _date, milestone) => milestone },
})
test('scheduler snapshots the matching step and preserves jobs on repeat scans', async () => {
  const priorAllocations = process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY, priorReminders = process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY
  process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY = 'true'; process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = 'true'
  try {
    jobs = new Map(); paid = 0
    const due = { ...model.INSTALLMENT_REMINDER_DEFAULTS.installment_7_days_before, body: 'Original due wording' }
    const overdue = { ...model.INSTALLMENT_REMINDER_DEFAULTS.installment_1_day_overdue, body: 'Original overdue wording' }
    overrides = [{ key: 'installment_7_days_before', copy_override: due }, { key: 'installment_1_day_overdue', copy_override: overdue }]
    await worker.queueInstallmentPaymentReminders()
    assert.equal(jobs.size, 2)
    assert.equal(jobs.get('installment_7_days_before').metadata.installment_copy_snapshot.body, 'Original due wording')
    assert.equal(jobs.get('installment_1_day_overdue').metadata.installment_copy_snapshot.body, 'Original overdue wording')
    overrides = overrides.map((row) => ({ ...row, copy_override: { ...row.copy_override, body: 'New wording' } }))
    await worker.queueInstallmentPaymentReminders()
    assert.equal(jobs.size, 2); assert.equal(jobs.get('installment_7_days_before').metadata.installment_copy_snapshot.body, 'Original due wording')
  } finally {
    if (priorAllocations === undefined) delete process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY; else process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY = priorAllocations
    if (priorReminders === undefined) delete process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY; else process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = priorReminders
  }
})
