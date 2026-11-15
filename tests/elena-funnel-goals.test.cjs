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

function productionBase() {
  const g = goalsLib.emptyFunnelGoals()
  g.newInquiries.monthly = 70
  g.toursScheduled.monthly = 20
  g.toursCompleted.monthly = 13
  g.proposalsSent.monthly = 12
  g.bookedEvents.monthly = 3
  g.revenue.monthly = 9000
  g.newInquiries.weekly = 16
  g.toursScheduled.weekly = 5
  g.toursCompleted.weekly = 3
  g.proposalsSent.weekly = 3
  g.bookedEvents.weekly = 1
  g.revenue.weekly = 2100
  g.bookedEvents.quarterly = 9
  g.bookedEvents.annual = 36
  g.bookedEvents.monthlyOverrides['2026-11'] = 3
  return g
}

test('QA brief rescales full funnel in order from saved rates', () => {
  const base = productionBase()
  const plan = elena.buildFunnelGoalsUpdatePlan(base, {
    brief: {
      bookingsPerMonth: 8,
      averageRevenuePerBooking: 4500,
      tourToBookingRate: 0.25,
    },
  })
  const merged = elena.mergeFunnelGoalAssignments(base, plan.assignments).goals
  assert.ok(merged.newInquiries.monthly >= merged.toursScheduled.monthly)
  assert.ok(merged.toursScheduled.monthly >= merged.toursCompleted.monthly)
  assert.ok(merged.toursCompleted.monthly >= merged.proposalsSent.monthly)
  assert.ok(merged.proposalsSent.monthly >= merged.bookedEvents.monthly)
  assert.equal(merged.bookedEvents.monthly, 8)
  assert.equal(merged.toursCompleted.monthly, 32)
  assert.equal(merged.revenue.monthly, 36000)
  assert.equal(merged.bookedEvents.weekly, 3)
  assert.equal(merged.bookedEvents.quarterly, 24)
  assert.equal(merged.bookedEvents.annual, 96)
  assert.equal(merged.bookedEvents.monthlyOverrides['2026-11'], 8)
  assert.ok(plan.assumptions.length >= 3)
})

test('missing upstream rates are rejected when saved goals cannot supply them', () => {
  const base = goalsLib.emptyFunnelGoals()
  assert.throws(
    () => elena.buildFunnelGoalsUpdatePlan(base, {
      brief: { bookingsPerMonth: 8, tourToBookingRate: 0.25 },
    }),
    /Need funnel rates/,
  )
})

test('incoherent funnel order is rejected before the card is built', () => {
  const base = productionBase()
  assert.throws(
    () => elena.buildFunnelGoalsUpdatePlan(base, {
      goalValues: [
        { metric: 'toursScheduled', cadence: 'monthly', value: 5 },
        { metric: 'toursCompleted', cadence: 'monthly', value: 20 },
      ],
    }),
    /Funnel order is invalid/,
  )
})

test('prepare_funnel_goals_card tool is gated to settings permission', () => {
  const routeSource = fs.readFileSync('src/app/api/portal/elena-chat/route.ts', 'utf8')
  assert.match(routeSource, /prepare_funnel_goals_card:\s*\['settings'\]/)
  assert.match(routeSource, /buildFunnelGoalsUpdatePlan/)
})

test('Elena funnel goals card persists through the shared funnel-goals PUT path', () => {
  const card = fs.readFileSync('src/components/portal/ElenaFunnelGoalsCard.tsx', 'utf8')
  assert.match(card, /saveFunnelGoals/)
  assert.match(card, /Save goals/)
})

test('funnel goals GET allows settings-only readers', () => {
  const routeSource = fs.readFileSync('src/app/api/portal/funnel-goals/route.ts', 'utf8')
  assert.match(routeSource, /memberCan\(member,'settings'\)/)
  assert.match(routeSource, /lead or settings access/)
})