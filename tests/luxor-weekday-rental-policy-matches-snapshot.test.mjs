import test from 'node:test'
import assert from 'node:assert/strict'
import { weekdayRentalPolicyMatchesSnapshot } from '../src/lib/luxorWeekdayRentalPolicyMatchesSnapshot.ts'

const shared = {
  enabled: true,
  hourly_rate: 400,
  minimum_hours: 3,
  time_increment_minutes: 60,
  reset_window_policy: 'allowed',
  booking_policy: 'one_per_date',
  cleanup_buffer_minutes: 0,
  security_hours_policy: 'arrival_to_end',
  selection_surface: 'portal_only',
}

test('v2 policy matches its historical snapshot without v3-only price fields', () => {
  const policy = { ...shared, pricing_version: 2, minimum_price: 1200, additional_hour_rate: 0 }
  const snapshot = {
    version: 2,
    event_date: '2026-10-14',
    start_time: '09:00',
    end_time: '13:00',
    duration_minutes: 240,
    duration_hours: 4,
    hourly_rate: 400,
    rental_total: 1600,
    ...Object.fromEntries(Object.entries(shared).filter(([key]) => key !== 'enabled')),
    time_zone: 'America/Chicago',
  }

  assert.equal(snapshot.minimum_price, undefined)
  assert.equal(snapshot.additional_hour_rate, undefined)
  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, snapshot), true)
})

test('v3 policy matches a snapshot carrying the minimum and additional-hour prices', () => {
  const policy = { ...shared, pricing_version: 3, minimum_price: 1200, additional_hour_rate: 200 }
  const snapshot = {
    version: 3,
    event_date: '2026-10-14',
    start_time: '09:00',
    end_time: '13:00',
    duration_minutes: 240,
    duration_hours: 4,
    hourly_rate: 400,
    minimum_price: 1200,
    additional_hour_rate: 200,
    rental_total: 1400,
    ...Object.fromEntries(Object.entries(shared).filter(([key]) => key !== 'enabled')),
    time_zone: 'America/Chicago',
  }

  assert.equal(weekdayRentalPolicyMatchesSnapshot(policy, snapshot), true)
})

test('version and version-specific price edits do not match a frozen snapshot', () => {
  const v3Policy = { ...shared, pricing_version: 3, minimum_price: 1200, additional_hour_rate: 200 }
  const v3Snapshot = {
    version: 3,
    event_date: '2026-10-14',
    start_time: '09:00',
    end_time: '13:00',
    duration_minutes: 240,
    duration_hours: 4,
    hourly_rate: 400,
    minimum_price: 1200,
    additional_hour_rate: 200,
    rental_total: 1400,
    ...Object.fromEntries(Object.entries(shared).filter(([key]) => key !== 'enabled')),
    time_zone: 'America/Chicago',
  }

  assert.equal(weekdayRentalPolicyMatchesSnapshot({ ...v3Policy, pricing_version: 2 }, v3Snapshot), false)
  assert.equal(weekdayRentalPolicyMatchesSnapshot({ ...v3Policy, additional_hour_rate: 250 }, v3Snapshot), false)
  assert.equal(weekdayRentalPolicyMatchesSnapshot({ ...v3Policy, minimum_price: 1250 }, v3Snapshot), false)
})
