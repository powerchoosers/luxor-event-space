/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const Module = require('node:module')
const path = require('node:path')

function load(file, stubs = {}) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file)
  m.paths = module.paths
  const old = Module._load
  Module._load = function (n, p, i) {
    return n in stubs ? stubs[n] : old.call(this, n, p, i)
  }
  try {
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      m.filename,
    )
  } finally {
    Module._load = old
  }
  return m.exports
}

const periods = load('src/lib/luxorFunnelPeriods.ts')
const goalsLib = load('src/lib/luxorFunnelGoals.ts', { './luxorFunnelPeriods': periods })
const elena = load('src/lib/luxorFunnelGoalsElena.ts', {
  '@/lib/luxorFunnelGoals': goalsLib,
  'src/lib/luxorFunnelGoals.ts': goalsLib,
})

test('assignmentsFromBrief derives monthly funnel targets from bookings, revenue, and tour close rate', () => {
  const assignments = elena.assignmentsFromBrief({
    bookingsPerMonth: 8,
    averageRevenuePerBooking: 4500,
    tourToBookingRate: 0.25,
  })
  assert.equal(assignments.find((row) => row.metric === 'bookedEvents')?.value, 8)
  assert.equal(assignments.find((row) => row.metric === 'revenue')?.value, 36000)
  assert.equal(assignments.find((row) => row.metric === 'toursCompleted')?.value, 32)
})

test('mergeFunnelGoalAssignments updates only assigned fields and validates merged goals', () => {
  const base = goalsLib.emptyFunnelGoals()
  base.newInquiries.monthly = 40
  const { goals, changedPaths } = elena.mergeFunnelGoalAssignments(base, [
    { metric: 'bookedEvents', cadence: 'monthly', value: 8 },
    { metric: 'revenue', cadence: 'monthly', value: 36000 },
  ])
  assert.equal(goals.newInquiries.monthly, 40)
  assert.equal(goals.bookedEvents.monthly, 8)
  assert.equal(goals.revenue.monthly, 36000)
  assert.deepEqual(changedPaths, ['bookedEvents.monthly', 'revenue.monthly'])
  assert.ok(goalsLib.parseFunnelGoals(goals))
})

test('prepare_funnel_goals_card tool is gated to settings permission', () => {
  const routeSource = fs.readFileSync('src/app/api/portal/elena-chat/route.ts', 'utf8')
  assert.match(routeSource, /prepare_funnel_goals_card:\s*\['settings'\]/)
  assert.match(routeSource, /name:\s*'prepare_funnel_goals_card'/)
  assert.match(routeSource, /buildElenaFunnelGoalsCard/)
  assert.match(routeSource, /never claim they were saved/)
})

test('Elena funnel goals card persists through the shared funnel-goals PUT path', () => {
  const card = fs.readFileSync('src/components/portal/ElenaFunnelGoalsCard.tsx', 'utf8')
  assert.match(card, /saveFunnelGoals/)
  assert.match(card, /Save goals/)
  assert.doesNotMatch(card, /service_role/)
})