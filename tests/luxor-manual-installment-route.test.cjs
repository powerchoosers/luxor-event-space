'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const repo = path.resolve(__dirname, '..')
const routePath = path.join(repo, 'src/app/api/payments/manual-installment/route.ts')
const calls = []
let booking
let installment
let paidPayments
let rpcResult
let replayResult

function mockResponse() {
  return { json: (body, init = {}) => ({ body, status: init.status || 200 }) }
}

function loadRoute() {
  const source = fs.readFileSync(routePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: routePath,
  }).outputText
  const mocks = {
    'next/server': { NextResponse: mockResponse() },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'owner@example.invalid' }) },
    '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active' }), memberCan: () => true },
    '@/lib/luxorBookingsServer': { getLuxorBooking: async () => booking },
    '@/lib/luxorInvoicesServer': {
      getInvoice: async () => ({ id: 'master', invoice_kind: 'event' }),
      getInvoiceByBookingAndKind: async () => ({ id: 'final', booking_id: 'booking', parent_invoice_id: 'master', invoice_kind: 'final_balance', status: 'sent', total: 3000 }),
      listPaidPaymentsByInvoice: async () => paidPayments,
    },
    '@/lib/luxorInquiriesServer': { getLuxorInquiry: async () => ({ id: 'inquiry', status: 'booked', is_test: false }) },
    '@/lib/luxorPaymentInstallmentsServer': { listLuxorPaymentInstallments: async () => [installment] },
    '@/lib/luxorStripeCheckoutServer': { expireLuxorCheckoutForRepricing: async () => undefined },
    '@/lib/luxorTestLeadServer': { assertLuxorProductionSideEffectsAllowed: async () => undefined },
    '@/lib/luxorPaymentDashboardModel': {
      isBookingPaymentMilestone: (row) => row.installment_order === 1 && row.label === 'Booking Payment',
      installmentPaidAmount: (row, payments) => payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + (payment.metadata?.installment_allocations || []).filter((allocation) => allocation.installment_id === row.id).reduce((total, allocation) => total + allocation.amount, 0), 0),
    },
    '@/lib/luxorTourPlanningServer': { zonedTourDateTimeToUtc: (date) => {
      const [year, month, day] = date.split('-').map(Number)
      const target = Date.UTC(year, month - 1, day)
      let result = new Date(target)
      for (let index = 0; index < 2; index += 1) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(result)
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
        result = new Date(result.getTime() + target - Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute)))
      }
      return result
    } },
    '@/lib/supabaseRestServer': { SupabaseRestError: class SupabaseRestError extends Error {}, supabaseRestStrict: async (path, init) => { calls.push({ path, init }); return path.includes('luxor_lookup_manual_installment_payment_replay') ? replayResult : rpcResult } },
  }
  const loaded = new Module(routePath, module)
  loaded.filename = routePath
  loaded.paths = Module._nodeModulePaths(path.dirname(routePath))
  loaded.require = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : require(specifier)
  loaded._compile(compiled, routePath)
  return loaded.exports
}

const route = loadRoute()
const paymentKey = '11111111-1111-4111-8111-111111111111'
const bookingId = '22222222-2222-4222-8222-222222222222'
const installmentId = '33333333-3333-4333-8333-333333333333'
const todayChicago = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const baseBody = {
  bookingId, installmentId, amount: 250, paidOn: todayChicago,
  paymentMethod: 'Zelle', reference: 'bank ref 42', notes: 'partial payment', idempotencyKey: paymentKey,
}
const request = (body) => ({ json: async () => body })

test.beforeEach(() => {
  process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY = 'true'
  calls.length = 0
  booking = { id: bookingId, inquiry_id: 'inquiry', invoice_id: 'master', status: 'confirmed', contract_status: 'signed', contract_signed_at: '2000-01-01T12:00:00Z' }
  installment = { id: installmentId, booking_id: bookingId, invoice_id: 'master', label: 'Payment 2', installment_order: 2, amount: 750, due_at: '2999-01-01T12:00:00Z', status: 'scheduled', metadata: {} }
  paidPayments = []
  rpcResult = { payment: { id: 'payment', amount: 250 }, allocations: [{ installment_id: 'monthly', amount: 250 }], replayed: false }
  replayResult = { payment: null, allocations: [], replayed: false }
})

test('records a verified early partial installment through the atomic RPC', async () => {
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(calls.length, 2)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
  const args = JSON.parse(calls[1].init.body)
  assert.equal(args.p_booking_id, bookingId)
  assert.equal(args.p_invoice_id, 'final')
  assert.equal(args.p_amount, 250)
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(args.p_paid_at)), baseBody.paidOn)
  assert.equal(args.p_idempotency_key, paymentKey)
  assert.deepEqual(args.p_allocations, [{ installment_id: installmentId, amount: 250 }])
})

test('rejects an allocation over the obligation remainder before database mutation', async () => {
  const response = await route.POST(request({ ...baseBody, amount: 751 }))
  assert.equal(response.status, 409)
  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
})

test('refuses an unreconciled legacy partial obligation', async () => {
  installment = { ...installment, status: 'partial', metadata: {} }
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 409)
  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
})

test('refuses payment dates before the signed agreement', async () => {
  booking.contract_signed_at = '2099-01-01T12:00:00Z'
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 409)
  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
})

test('keeps the workflow disabled until the reviewed allocation migration is enabled', async () => {
  process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY = 'false'
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 503)
  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
})

test('replays a completed full payment before mutable booking checks', async () => {
  booking = null
  replayResult = { payment: { id: 'payment-already-recorded', amount: 250 }, allocations: [{ installment_id: installmentId, amount: 250 }], replayed: true }
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 200)
  assert.equal(response.body.replayed, true)
  assert.equal(response.body.payment.id, 'payment-already-recorded')
  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /luxor_lookup_manual_installment_payment_replay/)
})


test('a retry cannot report a corrected receipt as paid', async () => {
  replayResult = { payment: { id: 'corrected-payment', status: 'void' }, allocations: [], replayed: true }
  const response = await route.POST(request(baseBody))
  assert.equal(response.status, 409)
  assert.equal(response.body.paymentOutcome, 'not_recorded')
  assert.match(response.body.error, /corrected/)
})
