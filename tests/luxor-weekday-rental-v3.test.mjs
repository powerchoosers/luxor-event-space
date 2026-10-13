import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'

// Node's native TS stripping does not resolve this repository's extensionless
// TypeScript imports. Register the existing TS module with Node's test runner.
const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
}
const {
  formatWeekdayCustomRentalPriceBreakdown,
  validateWeekdayCustomRentalSchedule,
  validateWeekdayCustomRentalTiming,
  weekdayCustomRentalSnapshot,
} = require('../src/lib/luxorWeekdayRental.ts')

const policy = {
  enabled: true,
  pricing_version: 3,
  hourly_rate: 400,
  minimum_hours: 3,
  minimum_price: 1200,
  additional_hour_rate: 200,
  time_increment_minutes: 60,
  reset_window_policy: 'allowed',
  booking_policy: 'one_per_date',
  cleanup_buffer_minutes: 0,
  security_hours_policy: 'arrival_to_end',
  selection_surface: 'portal_only',
}

function price(eventDate, start, end) {
  const timing = validateWeekdayCustomRentalTiming(eventDate, start, end, policy)
  assert.equal(timing.valid, true, timing.error)
  return weekdayCustomRentalSnapshot(eventDate, timing, policy)
}

test('weekday v3 charges the first three hours at the approved minimum, then $200 per full hour', () => {
  assert.equal(price('2026-10-19', '09:00', '12:00').rental_total, 1200)
  assert.equal(price('2026-10-20', '09:00', '13:00').rental_total, 1400)
  assert.equal(price('2026-10-21', '14:00', '19:00').rental_total, 1600)
  assert.equal(price('2026-10-22', '15:00', '21:00').rental_total, 1800)
})

test('one and two hour weekday rentals remain allowed at the three-hour minimum', () => {
  assert.equal(price('2026-10-19', '10:00', '11:00').rental_total, 1200)
  assert.equal(price('2026-10-19', '10:00', '12:00').rental_total, 1200)
})

test('23:00-01:00 is a two-hour next-day rental and remains at the minimum', () => {
  const snapshot = price('2026-10-19', '23:00', '01:00')
  assert.equal(snapshot.duration_minutes, 120)
  assert.equal(snapshot.rental_total, 1200)
})

test('rental end may follow event end, while an event may not outlast rental access', () => {
  assert.equal(validateWeekdayCustomRentalSchedule('2026-10-19', '09:00', '20:00', '09:00', '19:30', policy).valid, true)
  assert.equal(validateWeekdayCustomRentalSchedule('2026-10-19', '09:00', '20:00', '09:00', '20:00', policy).valid, true)
  const lateEvent = validateWeekdayCustomRentalSchedule('2026-10-19', '09:00', '20:00', '09:00', '20:30', policy)
  assert.equal(lateEvent.valid, false)
  assert.match(lateEvent.error, /at or before your rental end time/)
})

test('overnight access is evaluated into the following day for the event boundary', () => {
  const valid = validateWeekdayCustomRentalSchedule('2026-10-19', '23:00', '01:00', '23:00', '01:00', policy)
  assert.equal(valid.valid, true)
  const beyond = validateWeekdayCustomRentalSchedule('2026-10-19', '23:00', '01:00', '23:00', '01:30', policy)
  assert.equal(beyond.valid, false)
})

test('proposal copy states the minimum and extra-hour formula explicitly', () => {
  assert.equal(formatWeekdayCustomRentalPriceBreakdown(price('2026-10-20', '09:00', '13:00')), '$1,200.00 minimum (first 3 billed hours) + 1 additional hour at $200.00 each = $1,400.00')
})
