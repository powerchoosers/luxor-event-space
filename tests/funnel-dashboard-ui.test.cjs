/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function load(file, stubs = {}) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file); m.paths = module.paths
  const original = Module._load
  Module._load = function (name, parent, isMain) { return name in stubs ? stubs[name] : original.call(this, name, parent, isMain) }
  try { m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, m.filename) } finally { Module._load = original }
  return m.exports
}
const periods = load('src/lib/luxorFunnelPeriods.ts')
const goals = load('src/lib/luxorFunnelGoals.ts', { './luxorFunnelPeriods': periods })
const button = ({ children, variant, size, ...props }) => React.createElement('button', props, children)
const ui = load('src/components/portal/LeadsFunnelDashboard.tsx', {
  '@/lib/luxorFunnelPeriods': periods, '@/lib/luxorFunnelGoals': goals,
  '@/lib/icons/phosphor-compat': new Proxy({}, { get: () => () => null }),
  '@/components/portal/PortalUI': { PortalButton: button, PortalModal: () => null },
})
function storage() { const data = new Map(); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) } }
function snapshot(g, revision = 1) { return { available: true, goals: g, revision, updatedAt: '2026-11-13T01:00:00Z', canEdit: true } }
function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
const empty = goals.emptyFunnelGoals

test('missing values remain distinct from actual zero and valid currency', () => {
  assert.equal(ui.funnelNumber(null), '—'); assert.equal(ui.funnelNumber(0), '0')
  assert.equal(ui.funnelNumber(12.5, 'conversionRate'), '12.5%'); assert.equal(ui.funnelNumber(.29, 'revenue'), '$0.29')
})
test('analytics parser rejects stale period, missing metrics, malformed days and negative values', () => {
  const p = periods.getFunnelPeriod('weekly', '2026-11-12')
  const value = { period: p, metrics: Object.fromEntries([...goals.FUNNEL_GOAL_METRICS, 'depositsReceived', 'conversionRate'].map(k => [k, 0])), dailyLeads: p.days.map(date => ({ date, count: 0 })), issues: [] }
  assert.ok(ui.parseFunnelAnalytics(value, p))
  assert.equal(ui.parseFunnelAnalytics({ ...value, period: { ...p, endDate: '2026-12-01' } }, p), null)
  const missing = structuredClone(value); delete missing.metrics.newInquiries; assert.equal(ui.parseFunnelAnalytics(missing, p), null)
  const bad = structuredClone(value); bad.dailyLeads[0].count = -1; assert.equal(ui.parseFunnelAnalytics(bad, p), null)
})
test('snapshot parser requires exact goal schema, integer revision and valid update timestamp', () => {
  assert.ok(ui.parseGoalSnapshot(snapshot(empty())))
  assert.equal(ui.parseGoalSnapshot({ ...snapshot(empty()), revision: 1.5 }), null)
  assert.equal(ui.parseGoalSnapshot({ ...snapshot(empty()), updatedAt: 'bad' }), null)
})
test('unknown save retains stable request identity, blocks changed retry and accepts exact confirmation', async () => {
  const s = storage(); const g = empty(); g.newInquiries.daily = 5
  let request
  await assert.rejects(ui.saveFunnelGoals(g, 0, async (_, init) => { request = JSON.parse(init.body); throw Error('lost response') }, s), /lost/)
  assert.equal(ui.readPendingFunnelGoals(s).requestId, request.requestId)
  const changed = structuredClone(g); changed.newInquiries.daily = 6
  await assert.rejects(ui.saveFunnelGoals(changed, 0, async () => { throw Error('should not send') }, s), /original unconfirmed/)
  const saved = await ui.saveFunnelGoals(g, 9, async (_, init) => { assert.deepEqual(JSON.parse(init.body), request); return response({ ...snapshot(g), requestId: request.requestId }) }, s)
  assert.equal(saved.revision, 1); assert.equal(ui.readPendingFunnelGoals(s), null)
})
test('first definite conflict clears pending; later rejection cannot erase uncertain earlier commit', async () => {
  const s = storage(); const g = empty()
  const reject = async () => response({ committed: false, error: 'changed' }, 409)
  await assert.rejects(ui.saveFunnelGoals(g, 0, reject, s)); assert.equal(ui.readPendingFunnelGoals(s), null)
  await assert.rejects(ui.saveFunnelGoals(g, 0, async () => { throw Error('unknown') }, s))
  const old = ui.readPendingFunnelGoals(s)
  await assert.rejects(ui.saveFunnelGoals(g, 0, reject, s)); assert.deepEqual(ui.readPendingFunnelGoals(s), old)
})
test('invalid successful response preserves pending instead of pretending save completed', async () => {
  for (const failure of ['id', 'revision', 'goals']) {
    const s = storage(); const g = empty()
    await assert.rejects(ui.saveFunnelGoals(g, 0, async (_, init) => {
      const req = JSON.parse(init.body); const result = { ...snapshot(g), requestId: req.requestId }
      if (failure === 'id') result.requestId = 'wrong'
      if (failure === 'revision') result.revision = 20
      if (failure === 'goals') result.goals = { ...g, revenue: { ...g.revenue, daily: 1 } }
      return response(result)
    }, s), /could not be confirmed/)
    assert.ok(ui.readPendingFunnelGoals(s))
  }
})
test('daily chart retains seven, leap-month and full-quarter dates, labels, goal line and readable table', () => {
  for (const [kind, anchor, count] of [['weekly', '2026-11-12', 7], ['monthly', '2028-02-15', 29], ['quarterly', '2026-11-12', 92]]) {
    const p = periods.getFunnelPeriod(kind, anchor)
    const html = renderToStaticMarkup(React.createElement(ui.FunnelDailyChart, { period: p, days: p.days.map(date => ({ date, count: 5 })), dailyGoal: 5, total: count * 5, periodGoal: count * 4 }))
    assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length, count)
    assert.match(html, /overflow-x-auto/); assert.match(html, /border-dashed/); assert.match(html, /125%/)
    assert.ok(html.includes(p.startDate)); assert.ok(html.includes(p.endDate))
  }
})
test('dashboard defaults weekly range with six KPIs and accessible period arrows', () => {
  const week = periods.getDefaultFunnelWeekRange('2026-11-12')
  const html = renderToStaticMarkup(React.createElement(ui.LeadsFunnelDashboard, { range: week }))
  for (const label of ['New inquiries', 'Tours scheduled', 'Tours completed', 'Proposals sent', 'Deposits received', 'Conversion rate']) assert.ok(html.includes(label))
  assert.doesNotMatch(html, /Performance period/)
  assert.doesNotMatch(html, /aria-label="Previous period"/)
  assert.doesNotMatch(html, /Sun – Sat · Central time/)
  assert.match(html, /Edit Goals/); assert.match(html, /Sales Funnel Analysis/)
})
test('source wires abort cleanup, all cadences/overrides and recovery without discarding unknown request', () => {
  const source = fs.readFileSync('src/components/portal/LeadsFunnelDashboard.tsx', 'utf8')
  assert.equal((source.match(/active = false; controller.abort\(\)/g) || []).length, 2)
  assert.match(source, /FUNNEL_GOAL_CADENCES.map/); assert.match(source, /monthlyOverrides/); assert.match(source, /quarterlyOverrides/)
  assert.match(source, /disabled=\{saving \|\| pending\}/)
  assert.match(source, /!pending \? <PortalButton[\s\S]*?Reload saved goals/)
  assert.match(source, /onPeriodChange\?\.\(period\)/)
})
