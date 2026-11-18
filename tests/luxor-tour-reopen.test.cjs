/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTypeScript(filePath, stubs = {}) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(path.join(root, `${path.basename(filePath)}.synthetic.cjs`), module)
  loaded.filename = path.join(root, `${path.basename(filePath)}.synthetic.cjs`)
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, loaded.filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

const tourMetricsStub = loadTypeScript('src/lib/luxorTourMetrics.ts')
const { canReopenLuxorTourCompletion, createLuxorTourReopenPayload, resolveLuxorTourOutcomePrecondition } = loadTypeScript('src/lib/luxorTourOutcome.ts', {
  '@/lib/luxorTourMetrics': tourMetricsStub,
  './luxorTourMetrics': tourMetricsStub,
})

test('canReopenLuxorTourCompletion allows attended tours on or after today', () => {
  const todayKey = '2026-11-17'
  assert.equal(canReopenLuxorTourCompletion({
    tour_attendance_status: 'attended',
    preferred_tour_date: '2026-11-20',
    status: 'tour_confirmed',
  }, todayKey), true)
  assert.equal(canReopenLuxorTourCompletion({
    tour_attendance_status: 'attended',
    preferred_tour_date: '2026-11-16',
    status: 'tour_confirmed',
  }, todayKey), false)
})

test('createLuxorTourReopenPayload posts a guarded reopen action', () => {
  assert.deepEqual(createLuxorTourReopenPayload({
    inquiryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    expectedAttendance: 'attended',
    visitId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    visitVersion: 2,
  }).action, 'reopen-tour')
})

test('reopen uses the same stale-outcome guard as completion', () => {
  assert.equal(resolveLuxorTourOutcomePrecondition('attended', 'pending', 'attended'), 'apply')
  assert.equal(resolveLuxorTourOutcomePrecondition('attended', 'pending', 'pending'), 'stale')
})