import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const helperSource = fs.readFileSync(new URL('../src/lib/luxorInvoiceNotificationEligibility.ts', import.meta.url), 'utf8')
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const { getLuxorOutstandingPaymentRequestAmount } = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString('base64')}`)
const request = (overrides = {}) => ({
  invoice_kind: 'deposit',
  status: 'sent',
  payment_requested_at: '2026-10-01T12:00:00.000Z',
  payment_requested_amount: 1200,
  total: 1200,
  ...overrides,
})

test('deposit invoice with an active request is payable', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request()), 1200)
})

test('final balance invoice with an active request is payable', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ invoice_kind: 'final_balance' })), 1200)
})

test('security deposit invoice with an active request is payable', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ invoice_kind: 'security_deposit' })), 1200)
})

test('event proposal does not create a payment due notice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ invoice_kind: 'event' })), null)
})

test('unrecognized invoice kind does not create a payment due notice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ invoice_kind: 'other' })), null)
})

test('draft payment invoice does not create a payment due notice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ status: 'draft' })), null)
})

test('cancelled payment invoice does not create a payment due notice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ status: 'cancelled' })), null)
})

test('paid payment invoice does not create a payment due notice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ status: 'paid' })), null)
})

test('paid_at suppresses a due notice even if status has not caught up', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ paid_at: '2026-10-03T12:00:00.000Z' })), null)
})

test('payment request timestamp is required', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_at: null })), null)
})

test('payment request amount is required', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: null })), null)
})

test('zero, negative, and non-finite requests are excluded', () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: amount })), null)
  }
})

test('an original request uses the invoice total less verified payments', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: 1200, total: 1200 }), 0), 1200)
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: 1200, total: 1200 }), 400), 800)
})

test('a reissued partial-payment request does not subtract its historic payment twice', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: 800, total: 1200 }), 400), 800)
})

test('a fully paid invoice has no outstanding due amount', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: 800, total: 1200 }), 1200), null)
})

test('payment request evidence is required even when the invoice has an unpaid balance', () => {
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_at: null, total: 1200 }), 0), null)
  assert.equal(getLuxorOutstandingPaymentRequestAmount(request({ payment_requested_amount: null, total: 1200 }), 0), null)
})
