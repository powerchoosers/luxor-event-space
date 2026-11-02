'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const routePath = path.resolve(__dirname, '../src/app/api/payments/reminders/route.ts')
const bookingId = '11111111-1111-4111-8111-111111111111'
const inquiryId = '22222222-2222-4222-8222-222222222222'
const installmentJob = {
  id: 'reminder-1', job_type: 'installment_payment_reminder', status: 'queued', booking_id: bookingId,
  inquiry_id: inquiryId, subject: 'Upcoming installment payment', body: 'Synthetic reminder',
  recipient_email: 'client@example.invalid', created_at: '2026-11-01T15:00:00.000Z',
  updated_at: '2026-11-01T15:00:00.000Z', scheduled_for: '2026-11-03T16:00:00.000Z', sent_at: null,
  metadata: { invoice_id: 'invoice-1', installment_id: 'installment-1', due_date: '2026-11-10', amount_due: 250, obligation_label: 'Payment 2' },
}
let candidates
let mailRows
let providerEvents

const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers || {} }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'owner@example.invalid' }) },
  '@/lib/luxorBookingsServer': { getLuxorBooking: async () => ({ id: bookingId, inquiry_id: inquiryId }) },
  '@/lib/luxorInvoicesServer': { listInvoicesByBooking: async () => [{ id: 'invoice-1' }] },
  '@/lib/luxorPaymentDashboardModel': { paymentReminderJobsForEvent: (jobs, selectedBooking, invoiceIds) => jobs.filter((job) => job.booking_id === selectedBooking || invoiceIds.has(job.metadata?.invoice_id)) },
  '@/lib/luxorProposalTerms': { luxorCalendarDate: () => '2026-11-02' },
  '@/lib/supabaseRestServer': { supabaseRest: async (path) => {
    if (path.startsWith('luxor_payments?')) return [{ id: 'paid-payment', booking_id: bookingId, invoice_id: 'invoice-1', status: 'paid' }]
    if (path.startsWith('luxor_email_jobs?')) return candidates
    if (path.startsWith('luxor_mail_messages?')) return mailRows
    if (path.startsWith('luxor_resend_events?')) return providerEvents
    throw new Error(`Unexpected synthetic query: ${path}`)
  } },
}
const source = fs.readFileSync(routePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: routePath,
}).outputText
const loaded = new Module(routePath, module)
loaded.filename = routePath
loaded.paths = Module._nodeModulePaths(path.dirname(routePath))
loaded.require = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : require(specifier)
loaded._compile(compiled, routePath)
const route = loaded.exports

test.beforeEach(() => {
  candidates = [installmentJob, { ...installmentJob, id: 'other-event', booking_id: '33333333-3333-4333-8333-333333333333', metadata: { invoice_id: 'other-invoice' } }]
  mailRows = []
  providerEvents = []
})

test('future reminder appears as persisted scheduled activity and excludes other events', async () => {
  const result = await route.GET({ nextUrl: new URL(`https://example.invalid/api/payments/reminders?bookingId=${bookingId}&inquiryId=${inquiryId}`) })
  assert.equal(result.status, 200)
  assert.equal(result.body.jobs.length, 1)
  assert.equal(result.body.jobs[0].id, 'reminder-1')
  assert.equal(result.body.jobs[0].delivery.status, 'pending')
})

test('refresh maps provider acceptance, delivery and open tracking from stored provider evidence', async () => {
  mailRows = [{ id: 'mail-1', provider: 'resend', provider_id: 'provider-1', status: 'sent', accepted_at: '2026-11-01T15:05:00.000Z', occurred_at: '2026-11-01T15:05:00.000Z', metadata: { emailJobId: 'reminder-1' } }]
  providerEvents = [
    { event_type: 'email.delivered', provider_email_id: 'provider-1', payload: { created_at: '2026-11-01T15:06:00.000Z' }, received_at: '2026-11-01T15:06:01.000Z' },
    { event_type: 'email.opened', provider_email_id: 'provider-1', payload: { created_at: '2026-11-01T15:07:00.000Z' }, received_at: '2026-11-01T15:07:01.000Z' },
  ]
  candidates = [{ ...installmentJob, status: 'sent', sent_at: '2026-11-01T15:05:00.000Z' }]
  const result = await route.GET({ nextUrl: new URL(`https://example.invalid/api/payments/reminders?bookingId=${bookingId}&inquiryId=${inquiryId}`) })
  assert.equal(result.body.jobs[0].delivery.status, 'opened')
  assert.equal(result.body.jobs[0].delivery.deliveredAt, '2026-11-01T15:06:00.000Z')
  assert.equal(result.body.jobs[0].delivery.openedAt, '2026-11-01T15:07:00.000Z')
  assert.equal(result.body.jobs[0].delivery.status.includes('viewed'), false)
})

test('provider accepted and failed states follow stored provider evidence', async () => {
  mailRows = [{ id: 'mail-1', provider: 'resend', provider_id: 'provider-1', status: 'sent', accepted_at: '2026-11-01T15:05:00.000Z', occurred_at: '2026-11-01T15:05:00.000Z', metadata: { emailJobId: 'reminder-1' } }]
  candidates = [{ ...installmentJob, status: 'queued' }]
  let result = await route.GET({ nextUrl: new URL(`https://example.invalid/api/payments/reminders?bookingId=${bookingId}&inquiryId=${inquiryId}`) })
  assert.equal(result.body.jobs[0].delivery.status, 'sent')
  assert.equal(result.body.jobs[0].delivery.sentAt, '2026-11-01T15:05:00.000Z')

  providerEvents = [{ event_type: 'email.bounced', provider_email_id: 'provider-1', payload: { created_at: '2026-11-01T15:06:00.000Z', data: { bounce: { message: 'Synthetic mailbox unavailable' } } }, received_at: '2026-11-01T15:06:01.000Z' }]
  result = await route.GET({ nextUrl: new URL(`https://example.invalid/api/payments/reminders?bookingId=${bookingId}&inquiryId=${inquiryId}`) })
  assert.equal(result.body.jobs[0].delivery.status, 'failed')
  assert.equal(result.body.jobs[0].delivery.providerError, 'Synthetic mailbox unavailable')
})

