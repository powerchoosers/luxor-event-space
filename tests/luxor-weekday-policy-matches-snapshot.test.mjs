import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
}
const { weekdayRentalPolicyMatchesSnapshot } = require('../src/lib/luxorWeekdayRentalPolicyMatchesSnapshot.ts')

const shared = {
  hourly_rate: 400,
  minimum_hours: 3,
  time_increment_minutes: 60,
  reset_window_policy: 'allowed',
  booking_policy: 'one_per_date',
  cleanup_buffer_minutes: 0,
  security_hours_policy: 'arrival_to_end',
  selection_surface: 'portal_only',
}

test('V2 publication terms compare their historical fields without inventing V3 prices', () => {
  const policy = { ...shared, enabled: true, pricing_version: 2 }
  const snapshot = { version: 2, ...shared, event_date: '2026-10-19', start_time: '09:00', end_time: '12:00', duration_minutes: 180, duration_hours: 3, rental_total: 1200 }
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, snapshot), true)
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, { ...snapshot, minimum_price: 1200 }), false)
})

test('V3 publication terms compare the saved minimum and additional-hour rate', () => {
  const policy = { ...shared, enabled: true, pricing_version: 3, minimum_price: 1200, additional_hour_rate: 200 }
  const snapshot = { version: 3, ...shared, minimum_price: 1200, additional_hour_rate: 200, event_date: '2026-10-19', start_time: '09:00', end_time: '13:00', duration_minutes: 240, duration_hours: 4, rental_total: 1400 }
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, snapshot), true)
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, { ...snapshot, additional_hour_rate: 250 }), false)
})

test('publication comparison checks the schema version field, not an absent pricing_version alias', () => {
  const policy = { ...shared, enabled: true, pricing_version: 3, minimum_price: 1200, additional_hour_rate: 200 }
  const snapshot = { version: 3, ...shared, minimum_price: 1200, additional_hour_rate: 200 }
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, snapshot), true)
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, { ...snapshot, version: 2 }), false)
})
