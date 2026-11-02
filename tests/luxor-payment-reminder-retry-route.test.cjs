'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const routePath = path.resolve(__dirname, '../src/app/api/payments/reminders/retry/route.ts')
const jobId = '11111111-1111-4111-8111-111111111111'
const bookingId = '22222222-2222-4222-8222-222222222222'
const inquiryId = '33333333-3333-4333-8333-333333333333'
let job
let windowCurrent
let patchCalls
let paymentRows

const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers || {} }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'owner@example.invalid' }) },
  '@/lib/luxorBookingsServer': { getLuxorBooking: async () => ({ id: bookingId, inquiry_id: inquiryId, invoice_id: 'master', status: 'confirmed', contract_status: 'signed', metadata: { deposit_paid_at: '2026-10-01T15:00:00Z' } }) },
  '@/lib/luxorInvoicesServer': {
    listInvoicesByBooking: async () => [{ id: 'master', invoice_kind: 'event' }, { id: 'final', invoice_kind: 'final_balance' }],
    listPaidPaymentsByInvoice: async () => paymentRows,
  },
  '@/lib/luxorInquiriesServer': { getLuxorInquiry: async () => ({ id: inquiryId, email: 'client@example.invalid', status: 'booked', is_test: false }) },
  '@/lib/luxorPaymentInstallmentsServer': { listLuxorPaymentInstallments: async () => [{ id: 'installment-1', invoice_id: 'master', label: 'Payment 2', installment_order: 2, amount: 500, due_at: '2026-11-09T12:00:00Z', status: 'scheduled', metadata: {} }] },
  '@/lib/luxorPaymentDashboardModel': {
    installmentPaidAmount: (_installment, payments) => payments.reduce((sum, payment) => sum + Number(payment.allocated || 0), 0),
    installmentReminderWindowIsCurrent: () => windowCurrent,
    isBookingPaymentMilestone: () => false,
    isFinalPaymentMilestone: () => false,
  },
  '@/lib/luxorPaymentRemindersServer': { areLuxorFinalPaymentRemindersEnabled: async () => true },
  '@/lib/luxorProposalTerms': { luxorCalendarDate: () => '2026-11-02', validCalendarDate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) },
  '@/lib/supabaseRestServer': { supabaseRest: async (_path, init = {}) => {
    if (init.method === 'PATCH') {
      patchCalls.push({ path: _path, body: JSON.parse(init.body) })
      return [{ ...job, status: 'queued', scheduled_for: JSON.parse(init.body).scheduled_for }]
    }
    return [job]
  } },
}
const source = fs.readFileSync(routePath, 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: routePath }).outputText
const loaded = new Module(routePath, module)
loaded.filename = routePath
loaded.paths = Module._nodeModulePaths(path.dirname(routePath))
loaded.require = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : require(specifier)
loaded._compile(compiled, routePath)
const route = loaded.exports
const request = () => ({ json: async () => ({ jobId }) })

test.beforeEach(() => {
  process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY = 'true'
  process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY = 'true'
  patchCalls = []
  paymentRows = []
  windowCurrent = true
  job = { id: jobId, job_type: 'installment_payment_reminder', status: 'failed', booking_id: bookingId, inquiry_id: inquiryId,
    recipient_email: 'client@example.invalid', attempts: 1, updated_at: '2026-11-02T15:00:00.000Z', test_run_id: null,
    metadata: { paymentReminderRetrySafe: true, installment_id: 'installment-1', invoice_id: 'master', due_date: '2026-11-09', milestone: 'installment_7_days_before' } }
})

test('requeues the same failed reminder only while the approved obligation window is current', async () => {
  const result = await route.POST(request())
  assert.equal(result.status, 200)
  assert.equal(result.body.state, 'queued')
  assert.equal(patchCalls.length, 1)
  assert.match(patchCalls[0].path, /status=eq.failed/)
  assert.equal(patchCalls[0].body.metadata.paymentReminderRetrySafe, false)
  assert.equal(patchCalls[0].body.metadata.paymentReminderRetries.length, 1)
})

test('does not retry after the approved send date or when provider outcome is uncertain', async () => {
  windowCurrent = false
  const late = await route.POST(request())
  assert.equal(late.status, 409)
  assert.equal(patchCalls.length, 0)
  windowCurrent = true
  job = { ...job, metadata: { ...job.metadata, paymentReminderRetrySafe: false } }
  const uncertain = await route.POST(request())
  assert.equal(uncertain.status, 409)
  assert.equal(patchCalls.length, 0)
})

test('a paid installment is never retried', async () => {
  paymentRows = [{ id: 'paid', status: 'paid', allocated: 500 }]
  const result = await route.POST(request())
  assert.equal(result.status, 409)
  assert.equal(patchCalls.length, 0)
})

