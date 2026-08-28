/* Offline: no provider calls or real mail. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const id = '6bf03796-e1e1-43b3-af39-979e01dbe7ac'
  const eventId = '6dfdb932-143e-4725-a4fb-b5ab4f058b6e'
  const now = new Date().toISOString()
  let rows = [{ id, event_id: eventId, message_id: id, attendee_email: 'guest@example.invalid', sequence: 4, partstat: 'ACCEPTED', reply_stamp: now }]
  let event = { id: eventId, sequence: 4, status: 'confirmed', updated_at: now, state: { title: 'Test tour', startUtc: now } }
  let attendee = { event_id: eventId, email: 'guest@example.invalid', active: true, sequence: 4, response_at: null, partstat: 'NEEDS-ACTION' }
  const paths = []
  let writes = []
  const server = load('src/lib/luxorCalendarReviewServer.ts', {
    './supabaseRestServer': { supabaseRest: async (path, init) => {
      paths.push(path)
      if (path.startsWith('rpc/')) { writes.push(JSON.parse(init.body)); return { decision: 'approve' } }
      if (path.startsWith('luxor_calendar_responses?')) return rows
      if (path.startsWith('luxor_calendar_events?')) return [event]
      if (path.startsWith('luxor_calendar_attendees?')) return [attendee]
      throw new Error(`Unexpected query ${path}`)
    } },
  })
  let page = await server.listLuxorCalendarReviews(0)
  assert.equal(page.items[0].canApprove, true)
  assert.equal(page.items[0].currentStatus, 'NEEDS-ACTION')
  assert.match(paths[0], /luxor_calendar_response_reviews=is.null/)
  assert.match(paths[0], /limit=26&offset=0/)
  assert.ok(paths.some(path => path.includes('active=eq.true&limit=50')))
  for (const changes of [{ active: false }, { sequence: 3 }, { response_at: now }]) {
    const saved = attendee; attendee = { ...saved, ...changes }
    assert.equal((await server.listLuxorCalendarReviews(0)).items[0].canApprove, false)
    attendee = saved
  }
  event.status = 'cancelled'
  assert.equal((await server.listLuxorCalendarReviews(0)).items[0].canApprove, false)
  event.status = 'confirmed'; event.sequence = 5
  assert.equal((await server.listLuxorCalendarReviews(0)).items[0].canApprove, false)
  event.sequence = 4
  rows[0].reply_stamp = new Date(Date.now() + 86400000).toISOString()
  assert.equal((await server.listLuxorCalendarReviews(0)).items[0].canApprove, false)
  rows[0].reply_stamp = new Date(Date.now() - 86400000).toISOString()
  assert.equal((await server.listLuxorCalendarReviews(0)).items[0].canApprove, false)
  rows = Array.from({ length: 26 }, () => ({ ...rows[0], reply_stamp: now }))
  page = await server.listLuxorCalendarReviews(1)
  assert.equal(page.items.length, 25); assert.equal(page.hasNext, true); assert.equal(page.page, 1)
  assert.ok(paths.some(path => path.includes('offset=25')))
  rows = []
  assert.deepEqual(await server.listLuxorCalendarReviews(2), { items: [], page: 2, hasNext: false })
  for (const invalid of [-1, 0.5, NaN, 100001]) await assert.rejects(() => server.listLuxorCalendarReviews(invalid))
  assert.equal(writes.length, 0, 'Listing must be read-only')
  console.log('PASS pending-review anti-join, bounded pagination, attendance state and stale/inactive/future-response guards')

  let authenticated = true
  let fail = false
  const route = load('src/app/api/portal/calendar-reviews/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => authenticated ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorCalendarReviewServer': { listLuxorCalendarReviews: server.listLuxorCalendarReviews,
      reviewLuxorCalendarReply: async (...args) => { if (fail) throw new Error('private provider failure'); return server.reviewLuxorCalendarReply(...args) } },
  })
  const url = 'https://example.invalid/api/portal/calendar-reviews'
  const body = { responseId: id, expectedSequence: 4, decision: 'approve', note: 'Confirmed directly', confirm: 'review-calendar-reply', reviewedBy: 'forged@example.invalid' }
  const post = (value = body, origin = 'https://example.invalid', contentType = 'application/json') => route.POST(new Request(url, {
    method: 'POST', headers: { origin, 'content-type': contentType }, body: typeof value === 'string' ? value : JSON.stringify(value),
  }))
  authenticated = false
  assert.equal((await route.GET(new Request(url))).status, 401)
  assert.equal((await post()).status, 401)
  authenticated = true
  assert.equal((await post(body, 'https://attacker.invalid')).status, 403)
  assert.equal((await post(body, '')).status, 403)
  assert.equal((await post(body, undefined, 'text/plain')).status, 415)
  assert.equal((await post(' '.repeat(4097))).status, 413)
  for (const value of ['null', '[]', '{', { ...body, note: '' }, { ...body, note: 'x'.repeat(501) },
    { ...body, expectedSequence: -1 }, { ...body, expectedSequence: 1.5 }, { ...body, expectedSequence: 2147483648 },
    { ...body, expectedSequence: '4' }, { ...body, responseId: 'bad' }, { ...body, decision: 'delete' }, { ...body, confirm: '' }]) {
    assert.equal((await post(value)).status, 400)
  }
  for (const value of ['-1', '1.2', 'NaN', '100001']) assert.equal((await route.GET(new Request(`${url}?page=${value}`))).status, 400)
  assert.equal(writes.length, 0)
  const response = await post()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /private, no-store/)
  assert.equal(writes[0].p_reviewed_by, 'owner@example.invalid', 'Use server session, never caller-supplied reviewer')
  assert.equal(writes[0].p_response_id, id)
  assert.equal(writes[0].p_expected_sequence, 4)
  fail = true
  const conflict = await post()
  assert.equal(conflict.status, 409)
  assert.ok(!(await conflict.text()).includes('private provider'))
  assert.match((await route.GET(new Request(url))).headers.get('cache-control'), /no-store/)
  console.log('PASS authorization, same-origin, confirmation, bounded payload, session-derived reviewer and sanitized conflicts')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
