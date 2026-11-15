'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadLuxorSalesBriefingHelpers() {
  const filename = path.join(root, 'src/lib/luxorSalesBriefingPipelineModel.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => original(name)
  loaded._compile(compiled, filename)
  return loaded.exports
}

const { bookingAwaitingInitialPayment, formatLuxorLeadWaitingLabel } = loadLuxorSalesBriefingHelpers()

test('booking payment gate uses paid luxor_payments against the deposit invoice', () => {
  const depositByBookingId = new Map([
    [
      'booking-1',
      { id: 'inv-deposit', booking_id: 'booking-1', invoice_kind: 'deposit', total: 500 },
    ],
  ])
  assert.equal(bookingAwaitingInitialPayment('booking-1', depositByBookingId, []), true)
  assert.equal(
    bookingAwaitingInitialPayment('booking-1', depositByBookingId, [
      { status: 'paid', invoice_id: 'inv-deposit', amount: 500 },
    ]),
    false,
  )
  assert.equal(
    bookingAwaitingInitialPayment('booking-1', depositByBookingId, [
      { status: 'paid', invoice_id: 'inv-deposit', amount: 250 },
    ]),
    true,
  )
})

test('waiting label formats short and day-long lead waits', () => {
  const now = Date.parse('2026-11-15T14:00:00.000Z')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-15T13:30:00.000Z', now), 'waiting <1h')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-15T08:00:00.000Z', now), 'waiting 6h')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-12T14:00:00.000Z', now), 'waiting 3d')
})