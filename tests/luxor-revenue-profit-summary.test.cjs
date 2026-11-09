'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const source = path.resolve(__dirname, '../src/lib/luxorRevenueProfitSummary.ts')
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = new Module(source, module)
loaded.filename = source
loaded._compile(compiled, source)
const { summarizeRevenueProfit } = loaded.exports
const event = (status, collections, paidDirectCosts, cashContribution, unknownExpenseCount = 0) => ({ booking: { status }, collections, paidDirectCosts, cashContribution, unknownExpenseCount })
test('weights cash margin by collected revenue and excludes inactive bookings', () => {
  const result = summarizeRevenueProfit([event('confirmed', 1000, 200, 800), event('completed', 100, 90, 10), event('cancelled', 500, 0, 500)], [])
  assert.equal(result.cashProfit, 810)
  assert.equal(result.collected, 1100)
  assert.equal(result.margin, 810 / 1100 * 100)
})
test('withholds totals for unresolved, missing, non-finite or inconsistent cash figures', () => {
  for (const events of [[event('confirmed', null, 0, null)], [event('confirmed', Infinity, 0, Infinity)], [event('confirmed', 100, 20, 100)]]) assert.equal(summarizeRevenueProfit(events, []).verified, false)
  assert.equal(summarizeRevenueProfit([event('confirmed', 100, 20, 80)], ['unverified source']).cashProfit, null)
})
test('does not invent a margin for zero or negative collections and reports unknown costs', () => {
  assert.equal(summarizeRevenueProfit([event('confirmed', 0, 10, -10, 1)], []).margin, null)
  assert.equal(summarizeRevenueProfit([event('confirmed', 0, 10, -10, 1)], []).unknownCosts, true)
})
