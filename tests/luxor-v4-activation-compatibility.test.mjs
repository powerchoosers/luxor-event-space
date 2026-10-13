import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  return request === 'server-only' ? {} : originalLoad.call(this, request, parent, isMain)
}
const {
  assertLuxorWeekdayRentalSelection,
  getLuxorWeekdayRentalClientPolicy,
  hasFrozenLegacyCustomTimeProposal,
} = require('../src/lib/luxorProposalPricingServer.ts')
Module._load = originalLoad
const {
  getWeekdayCustomRentalPolicy,
  validateWeekdayCustomRentalTiming,
  weekdayCustomRentalSnapshot,
} = require('../src/lib/luxorWeekdayRental.ts')

const originalEnv = Object.fromEntries([
  'LUXOR_CUSTOM_TIME_V4_READY',
  'LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY',
  'LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED',
  'LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY',
  'LUXOR_WEEKDAY_CUSTOM_RENTAL_V3_BOOKING_GUARD_READY',
].map((key) => [key, process.env[key]]))
test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const basePolicy = {
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

function historicalInvoice(version, status = 'draft') {
  const weekdayPolicy = version === 3
    ? { ...basePolicy, minimum_price: 1200, additional_hour_rate: 200 }
    : basePolicy
  const config = { pricing_mode: 'venue_plus_preferred_vendor_estimates', luxor_costs: { weekday_custom_rental: weekdayPolicy } }
  const policy = getWeekdayCustomRentalPolicy(config, { historicalSnapshot: version === 2 })
  const timing = validateWeekdayCustomRentalTiming('2026-10-19', '10:00', '13:00', policy, { historicalSnapshot: version === 2 })
  const snapshot = weekdayCustomRentalSnapshot('2026-10-19', timing, policy, {
    historicalSnapshot: version === 2,
    ...(version === 2 ? { legacyVersion: 2 } : {}),
  })
  return {
    invoice_kind: 'event',
    status,
    proposal_context: {
      event_date: '2026-10-19',
      weekday_custom_rental: snapshot,
      pricing_snapshot: { version, pricing_config: config },
    },
  }
}

const selection = {
  rentalPeriod: 'custom',
  eventDate: '2026-10-19',
  guestArrivalTime: '10:00',
  eventEndTime: '13:00',
}

test('frozen V2/V3 drafts and revision sources keep legacy policy before and after V4 activation', () => {
  for (const version of [2, 3]) {
    for (const status of ['draft', 'sent']) {
      const invoice = historicalInvoice(version, status)
      const config = invoice.proposal_context.pricing_snapshot.pricing_config
      assert.equal(hasFrozenLegacyCustomTimeProposal(invoice), true, `V${version} ${status} snapshot is recognized`)

      process.env.LUXOR_CUSTOM_TIME_V4_READY = 'false'
      process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY = 'false'
      assert.equal(getLuxorWeekdayRentalClientPolicy(config, true)?.pricing_version, version)
      assert.doesNotThrow(() => assertLuxorWeekdayRentalSelection(selection, config, true, true), `V${version} ${status} works before activation`)

      process.env.LUXOR_CUSTOM_TIME_V4_READY = 'true'
      process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY = 'true'
      process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED = 'false'
      process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY = 'false'
      process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_V3_BOOKING_GUARD_READY = 'false'
      assert.equal(getLuxorWeekdayRentalClientPolicy(config, true)?.pricing_version, version)
      assert.doesNotThrow(() => assertLuxorWeekdayRentalSelection(selection, config, true, true), `V${version} ${status} works after activation`)
    }
  }
})

test('a new current catalog fails closed when V4 is absent or explicitly disabled after activation', () => {
  process.env.LUXOR_CUSTOM_TIME_V4_READY = 'true'
  process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY = 'true'
  process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED = 'true'
  process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY = 'true'
  process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_V3_BOOKING_GUARD_READY = 'true'
  const legacyCatalog = { pricing_mode: 'venue_plus_preferred_vendor_estimates', luxor_costs: { weekday_custom_rental: { ...basePolicy, minimum_price: 1200, additional_hour_rate: 200 } } }
  assert.throws(() => assertLuxorWeekdayRentalSelection(selection, legacyCatalog), /not enabled with valid owner settings/)

  const disabledV4Catalog = {
    ...legacyCatalog,
    luxor_costs: {
      ...legacyCatalog.luxor_costs,
      custom_time_rental_v4: { monday_thursday: { enabled: false } },
    },
  }
  assert.throws(() => assertLuxorWeekdayRentalSelection(selection, disabledV4Catalog), /not enabled with valid owner settings/)
})
