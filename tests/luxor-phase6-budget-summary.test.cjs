/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadLuxorBudgetReporting() {
  const source = require('fs').readFileSync(path.join(root, 'src/lib/luxorBudgetReporting.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(path.join(root, 'luxor-budget-reporting.synthetic.cjs'), module)
  mod.filename = path.join(root, 'luxor-budget-reporting.synthetic.cjs')
  mod.paths = module.paths
  mod._compile(js, mod.filename)
  return mod.exports
}

const { buildLuxorBudgetSummary } = loadLuxorBudgetReporting()

test('incomplete when no targets are set', () => {
  const summary = buildLuxorBudgetSummary({
    revenueTarget: null,
    revenueActual: 100,
    expenseTargetTotal: null,
    expenseActual: 50,
  })
  assert.equal(summary.status, 'incomplete')
  assert.equal(summary.operationalMargin, 50)
})

test('over when collections fall below target', () => {
  const summary = buildLuxorBudgetSummary({
    revenueTarget: 1000,
    revenueActual: 800,
    expenseTargetTotal: 500,
    expenseActual: 400,
  })
  assert.equal(summary.status, 'over')
  assert.equal(summary.revenueVariance, -200)
})

test('on when within tolerance', () => {
  const summary = buildLuxorBudgetSummary({
    revenueTarget: 100,
    revenueActual: 100,
    expenseTargetTotal: 50,
    expenseActual: 50,
  })
  assert.equal(summary.status, 'on')
  assert.equal(summary.expenseVariance, 0)
})

test('under when collections exceed target and spending stays below plan', () => {
  const summary = buildLuxorBudgetSummary({
    revenueTarget: 100,
    revenueActual: 150,
    expenseTargetTotal: 80,
    expenseActual: 60,
  })
  assert.equal(summary.status, 'under')
})

const rangeSource = require('fs').readFileSync(path.join(root, 'src/lib/luxorBudgetMonthRange.ts'), 'utf8')
const rangeJs = ts.transpileModule(rangeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const rangeMod = new Module(path.join(root, 'luxor-budget-month-range.synthetic.cjs'), module)
rangeMod.filename = path.join(root, 'luxor-budget-month-range.synthetic.cjs')
rangeMod.paths = module.paths
rangeMod._compile(rangeJs, rangeMod.filename)
const { enumerateBudgetMonths, resolveBudgetExportRange } = rangeMod.exports

test('enumerateBudgetMonths caps at 24', () => {
  assert.throws(() => enumerateBudgetMonths('2024-01', '2027-01', 24))
  const list = enumerateBudgetMonths('2024-01', '2025-12', 24)
  assert.equal(list.length, 24)
})

test('resolveBudgetExportRange last 12', () => {
  const { from, to } = resolveBudgetExportRange('last_12', '2026-06', '', '')
  assert.equal(to, '2026-06')
  assert.equal(from, '2025-07')
})
