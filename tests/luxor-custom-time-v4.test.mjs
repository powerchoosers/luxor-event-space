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
const {
  getLuxorCustomTimeRentalPolicyV4,
  getLuxorCustomTimeRentalSnapshotV4,
  luxorCustomTimeDayGroup,
  luxorCustomTimeRentalSnapshotV4,
  validateLuxorCustomTimeRentalV4Config,
  validateLuxorCustomTimeScheduleV4,
} = require('../src/lib/luxorCustomTimeRentalV4.ts')

const config = {
  luxor_costs: {
    custom_time_rental_v4: {
      monday_thursday: { enabled: true, minimum_hours: 3, minimum_price: 1200, additional_hour_rate: 200, time_increment_minutes: 60, reset_window_policy: 'allowed', booking_policy: 'one_per_date', cleanup_buffer_minutes: 0, security_hours_policy: 'arrival_to_end', selection_surface: 'portal_only' },
      friday: { enabled: false },
      saturday: { enabled: false },
      sunday: { enabled: false },
    },
  },
}

test('Custom Time maps all days to the four configured day groups without guessing weekend prices', () => {
  assert.equal(luxorCustomTimeDayGroup('2026-10-19'), 'monday_thursday')
  assert.equal(luxorCustomTimeDayGroup('2026-10-23'), 'friday')
  assert.equal(luxorCustomTimeDayGroup('2026-10-24'), 'saturday')
  assert.equal(luxorCustomTimeDayGroup('2026-10-25'), 'sunday')
  assert.equal(getLuxorCustomTimeRentalPolicyV4(config, '2026-10-24'), null)
  assert.equal(getLuxorCustomTimeRentalPolicyV4(config, '2026-10-25'), null)
  assert.deepEqual(validateLuxorCustomTimeRentalV4Config(config), [])
})

test('weekday minimum allows actual one and two hour rentals; unpriced weekend groups fail closed', () => {
  const weekday = getLuxorCustomTimeRentalPolicyV4(config, '2026-10-19')
  assert.equal(luxorCustomTimeRentalSnapshotV4('2026-10-19', '10:00', '11:00', '10:00', '11:00', weekday).rental_total, 1200)
  assert.equal(luxorCustomTimeRentalSnapshotV4('2026-10-19', '10:00', '12:00', '10:00', '12:00', weekday).rental_total, 1200)
  assert.equal(getLuxorCustomTimeRentalPolicyV4(config, '2026-10-23'), null)
})

test('weekend Custom Time requires six-hour base blocks and the approved $350 extra-hour rate, without assuming base prices', () => {
  const weekend = { enabled: true, minimum_hours: 6, minimum_price: null, additional_hour_rate: 350, time_increment_minutes: 60, reset_window_policy: 'allowed', booking_policy: 'one_per_date', cleanup_buffer_minutes: 0, security_hours_policy: 'arrival_to_end', selection_surface: 'portal_only' }
  const weekendConfig = { luxor_costs: { custom_time_rental_v4: { ...config.luxor_costs.custom_time_rental_v4, friday: weekend } } }
  assert.ok(validateLuxorCustomTimeRentalV4Config(weekendConfig).some((error) => /positive friday Custom Time minimum price/i.test(error)))
  assert.equal(getLuxorCustomTimeRentalPolicyV4(weekendConfig, '2026-10-23'), null)
})

test('additional hours use the approved weekday rate and immutable local date-times', () => {
  const monday = getLuxorCustomTimeRentalPolicyV4(config, '2026-10-19')
  const snapshot = luxorCustomTimeRentalSnapshotV4('2026-10-19', '09:00', '13:00', '09:00', '12:00', monday)
  assert.equal(snapshot.rental_total, 1400)
  assert.equal(snapshot.rental_start_at, '2026-10-19T09:00:00')
  assert.equal(snapshot.rental_end_at, '2026-10-19T13:00:00')
  assert.equal(snapshot.guest_arrival_at, '2026-10-19T09:00:00')
  assert.equal(snapshot.event_end_at, '2026-10-19T12:00:00')
  assert.equal(getLuxorCustomTimeRentalSnapshotV4(snapshot)?.rental_total, 1400)
  assert.equal(getLuxorCustomTimeRentalSnapshotV4({ ...snapshot, rental_end_at: '2026-10-20T13:00:00' }), null)
})

test('overnight times persist on their actual local calendar dates and enforce event boundaries', () => {
  const monday = getLuxorCustomTimeRentalPolicyV4(config, '2026-10-19')
  const schedule = validateLuxorCustomTimeScheduleV4('2026-10-19', '23:00', '01:00', '23:00', '01:00', monday)
  assert.equal(schedule.valid, true)
  assert.equal(schedule.rental_start_at, undefined)
  assert.equal(schedule.rentalStartAt, '2026-10-19T23:00:00')
  assert.equal(schedule.rentalEndAt, '2026-10-20T01:00:00')
  assert.equal(schedule.guestArrivalAt, '2026-10-19T23:00:00')
  assert.equal(schedule.eventEndAt, '2026-10-20T01:00:00')
  assert.equal(validateLuxorCustomTimeScheduleV4('2026-10-19', '23:00', '01:00', '23:00', '01:30', monday).valid, false)
})
