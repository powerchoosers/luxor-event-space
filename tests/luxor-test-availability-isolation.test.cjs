/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

// The production modules are TypeScript and import server-only dependencies.
const originalLoad = Module._load
Module._load = function (id, ...args) {
  if (id === 'server-only' || id === './luxorTestLeadServer') return {}
  return originalLoad.call(this, id, ...args)
}
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpile(fs.readFileSync(filename, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }), filename,
)
const { isLuxorTestAvailabilityBooking, buildLuxorAvailabilityCalendar } = require('../src/lib/luxorAvailability.ts')
const { getVerifiedTestInquiryIds, annotateTestBookings, listLuxorBookings, findLuxorBookingConflicts } = require('../src/lib/luxorBookingsServer.ts')

const record = (extra = {}) => ({ status: 'confirmed', event_date: '2027-05-07', start_time: null, end_time: null, ...extra })

test('only established booking test markers are excluded', () => {
  assert.equal(isLuxorTestAvailabilityBooking(record({ inquiry_id: '00b264d6-a3fb-4ea3-9142-415f76385c39' })), true)
  assert.equal(isLuxorTestAvailabilityBooking(record({ is_test: true })), true)
  assert.equal(isLuxorTestAvailabilityBooking(record({ metadata: { is_test_record: true } })), true)
  for (const value of ['unverified', false, 0, null, '']) {
    assert.equal(isLuxorTestAvailabilityBooking(record({ metadata: { test_run_id: value } })), false)
  }
  assert.equal(buildLuxorAvailabilityCalendar([record()])['2027-05-07'].status, 'fully-booked')
  assert.equal(buildLuxorAvailabilityCalendar([record({ is_test: true })])['2027-05-07'], undefined)
})

test('deduplicates IDs, checks both sources, and keeps real and orphan bookings', async () => {
  const originalFetch = global.fetch
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = 'https://example.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture'
  const calls = []
  global.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('luxor_inquiries?')) return Response.json([{ id: 'flagged', is_test: true }, { id: 'real', is_test: false }])
    if (String(url).includes('luxor_test_identifier_collision_exemptions?')) return Response.json([{ inquiry_id: 'legacy' }])
    throw new Error('Unexpected request')
  }
  try {
    assert.deepEqual([...await getVerifiedTestInquiryIds([])], [])
    assert.equal(calls.length, 0)
    const ids = await getVerifiedTestInquiryIds(['flagged', 'legacy', 'real', 'flagged'])
    assert.equal(calls.length, 2)
    assert.deepEqual([...ids].sort(), ['flagged', 'legacy'])
    const items = await annotateTestBookings([{ inquiry_id: 'flagged' }, { inquiry_id: 'legacy' }, { inquiry_id: 'real' }, { inquiry_id: null }], ids)
    assert.deepEqual(items.map((item) => item.is_test), [true, true, false, false])
    assert.equal(calls.length, 2)
  } finally {
    global.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})

test('missing classification tables fail closed', async () => {
  const originalFetch = global.fetch
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = 'https://example.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture'
  try {
    for (const missing of ['luxor_inquiries?', 'luxor_test_identifier_collision_exemptions?']) {
      global.fetch = async (url) => String(url).includes(missing)
        ? Response.json({ code: 'PGRST205', message: 'Table unavailable' }, { status: 404 })
        : Response.json([])
      await assert.rejects(getVerifiedTestInquiryIds(['real']), /Table unavailable/)
    }
    global.fetch = async () => Response.json({ code: 'PGRST205', message: 'Table unavailable' }, { status: 404 })
    await assert.rejects(listLuxorBookings(1000, true), /Table unavailable/)
    await assert.rejects(findLuxorBookingConflicts('2027-05-07'), /Table unavailable/)
  } finally {
    global.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})
