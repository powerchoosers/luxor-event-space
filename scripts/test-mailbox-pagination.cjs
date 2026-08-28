/* Read-only mailbox paging: no real messages, credentials, network or DB. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const requests = []
  const helper = load('src/lib/luxorMailboxPageServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      requests.push({ url, init })
      return { page: 45, pageSize: 25, total: 1105, snapshot: '2026-08-28T00:00:00+00:00',
        folders: [{ folder: 'inbox', folderName: '/Inbox', folderPath: '/Inbox' }], stats: { total: 1105 }, folderCounts: { inbox: 1105 },
        messages: [{ id: 'mail-id', subject: 'Quinceañera &amp; event', from: 'Guest &amp; Family', to: 'Luxor', summary: 'A &amp; B', folder: 'inbox' }] }
    } },
    './luxorMailboxServer': { listLuxorReleasedMailFolders: async () => [{ folder: 'zoho-10001-10002', folderName: '/Empty', folderId: 'zoho-10001-10002', folderPath: '/Empty' }] },
  })
  const valid = { folder: 'all', query: '', page: 45, pageSize: 25, snapshot: null, starred: [] }
  assert.deepEqual(helper.parseLuxorMailboxPage(valid), { ...valid, email: undefined })
  for (const bad of [null, [], {}, { ...valid, folder: 'x),or(id)' }, { ...valid, query: 'a'.repeat(201) },
    { ...valid, page: -1 }, { ...valid, page: 1.1 }, { ...valid, page: 2147483648 }, { ...valid, pageSize: 101 },
    { ...valid, snapshot: 'now()' }, { ...valid, snapshot: 'not-a-date' }, { ...valid, starred: ['x")'] }, { ...valid, starred: null }]) {
    assert.throws(() => helper.parseLuxorMailboxPage(bad), /Invalid mailbox/)
  }
  assert.equal(helper.parseLuxorMailboxPage({ ...valid, snapshot: '2026-08-28T00:00:00.123456+00:00' }).snapshot, '2026-08-28T00:00:00.123456+00:00')
  assert.deepEqual(helper.parseLuxorMailboxPage({ ...valid, starred: ['mail-one', 'mail-one'] }).starred, ['mail-one'])
  const page = await helper.readLuxorMailboxPage(valid)
  assert.equal(requests[0].url, 'rpc/luxor_mailbox_page')
  assert.ok(requests[0].init.signal)
  assert.equal(JSON.parse(requests[0].init.body).p_page, 45)
  assert.equal(page.total, 1105)
  assert.equal(page.messages[0].subject, 'Quinceañera & event')
  assert.equal(page.messages[0].folderName, 'Inbox')
  assert.equal(page.folders[1].folderName, '/Empty', 'Empty released folders survive paging')
  let session = null
  let fail = false
  let readCalls = 0
  const route = load('src/app/api/email/mailbox/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
    '@/lib/luxorMailboxPageServer': { parseLuxorMailboxPage: helper.parseLuxorMailboxPage,
      readLuxorMailboxPage: async () => { readCalls++; if (fail) throw new Error('private SQL diagnostic'); return page } },
  })
  const origin = 'https://luxor.example.invalid'
  const post = (body = valid, headers = {}) => route.POST(new Request(`${origin}/api/email/mailbox`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }))
  assert.equal((await post()).status, 401)
  session = { email: 'owner@example.invalid' }
  assert.equal((await post(valid, { origin: 'https://other.example.invalid' })).status, 403)
  assert.equal((await post(valid, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await post({ ...valid, query: 'ñ'.repeat(33000) })).status, 413)
  assert.equal((await post(null)).status, 400)
  assert.equal(readCalls, 0)
  const response = await post()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal((await response.json()).total, 1105)
  fail = true
  const failed = await post()
  assert.equal(failed.status, 503)
  assert.doesNotMatch(await failed.text(), /SQL diagnostic/)
  console.log('PASS full-history paging parameters, bounds, timestamp precision, folder catalogue, decoded summaries, authenticated no-store reads and sanitized failures')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
