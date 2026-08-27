/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node --test tests/email-archive.test.cjs. All provider/database calls are mocked.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const ts = require('typescript')

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative)
  const localRequire = createRequire(filename)
  const loadedModule = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const requireMock = (id) => {
    if (id === 'server-only') return {}
    if (Object.hasOwn(mocks, id)) return mocks[id]
    if (id.startsWith('.')) return loadTs(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), id + '.ts')), mocks)
    return localRequire(id)
  }
  new Function('require', 'module', 'exports', code)(requireMock, loadedModule, loadedModule.exports)
  return loadedModule.exports
}

const { parseZohoJson } = loadTs('src/lib/zohoJson.ts')
test('numeric Zoho IDs survive JSON parsing without changing body text or timestamps', () => {
  const value = parseZohoJson('{"messageId":1787850392225155001,"folderId":10000000000000001,"receivedTime":1787850392225,"content":"ID 1787850392225155001 \\"quoted\\""}'.replace('\\"quoted\\"', '\\"quoted\\"'))
  assert.equal(value.messageId, '1787850392225155001')
  assert.equal(value.folderId, '10000000000000001')
  assert.equal(value.receivedTime, 1787850392225)
  assert.equal(value.content, 'ID 1787850392225155001 "quoted"')
  assert.throws(() => parseZohoJson('{broken'))
})

test('webhook preserves numeric message/folder IDs before storing the event', () => {
  const { parseZohoEmailWebhook } = loadTs('src/lib/luxorZohoWebhookServer.ts', { './supabaseRestServer': {} })
  const event = parseZohoEmailWebhook('{"messageId":1787850392225155001,"folderId":10000000000000001,"fromAddress":"Client <client@example.com>","receivedTime":1787850392225}')
  assert.equal(event.message_id, '1787850392225155001')
  assert.equal(event.event_key, event.message_id)
  assert.equal(event.metadata.folderId, '10000000000000001')
})

function provider(t, messages = []) {
  const calls = []
  const env = { ZOHO_CLIENT_ID: 'test', ZOHO_CLIENT_SECRET: 'test', ZOHO_REFRESH_TOKEN: 'test', ZOHO_ACCOUNT_ID: 'test', ZOHO_BASE_URL: 'https://provider.invalid/api', ZOHO_ACCOUNTS_SERVER: 'https://accounts.invalid' }
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const originalFetch = global.fetch
  let body = { content: '<p>Saved email</p>' }
  let contentStatus = 200
  global.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/oauth/v2/token')) return Response.json({ access_token: 'fake', expires_in: 3600 })
    if (String(url).includes('/messages/view?') || String(url).includes('/messages/search?')) {
      const start = Number(new URL(url).searchParams.get('start'))
      return Response.json({ data: start === 1 ? messages : [] })
    }
    if (String(url).endsWith('/details')) return Response.json({ data: { subject: 'Hello', fromAddress: 'client@example.com', receivedTime: '1787850392225', hasAttachment: false } })
    if (String(url).includes('/content?')) return Response.json({ data: body }, { status: contentStatus })
    throw new Error('Unexpected provider call: ' + url)
  }
  t.after(() => { global.fetch = originalFetch })
  return { mail: loadTs('src/lib/zohoMailServer.ts', { './supabaseRestServer': {} }), calls,
    setBody: (value) => { body = value }, setStatus: (status) => { contentStatus = status } }
}

test('body retrieval uses folder-aware content and details endpoints, not preview text', async (t) => {
  const { mail, calls } = provider(t, [{ messageId: '1787850392225155001', folderId: 'folder' }])
  const result = await mail.getLuxorZohoMessageDetail('1787850392225155001')
  assert.equal(result.content, '<p>Saved email</p>')
  assert.equal(result.summary, 'Saved email')
  assert(calls.some((url) => url.includes('/folders/folder/messages/1787850392225155001/content?')))
  assert(!calls.some((url) => url.includes('/messages/view/')))
})

test('missing content fails; a genuinely empty body is still valid', async (t) => {
  const { mail, setBody } = provider(t)
  setBody({ summary: 'Not a body' })
  await assert.rejects(mail.getLuxorZohoMessageDetail('missing', 'folder'), /did not return the email body/)
  setBody({ content: '' })
  assert.equal((await mail.getLuxorZohoMessageDetail('empty', 'folder')).content, '')
})

test('authorization/rate limit errors are safe and are not cached as message content', async (t) => {
  const { mail, setStatus, calls } = provider(t)
  setStatus(401)
  await assert.rejects(mail.getLuxorZohoMessageDetail('denied', 'folder'), (error) => error.status === 401)
  setStatus(429)
  await assert.rejects(mail.getLuxorZohoMessageDetail('limited', 'folder'), (error) => error.status === 429)
  assert.equal(calls.filter((url) => url.includes('/limited/content?')).length, 1)
})

test('legacy rounded ID recovery requires one matching sender, subject, and timestamp', async (t) => {
  const id = '1787850392225155001'
  const identity = { sender_email: 'client@example.com', subject: 'Hello', received_at: new Date(1787850392225).toISOString() }
  const { mail } = provider(t, [{ messageId: id, folderId: 'folder', fromAddress: identity.sender_email, subject: 'Hello', receivedTime: '1787850392225' }])
  assert.equal((await mail.resolveArchivedZohoMessage(Number(id).toString(), identity)).id, id)
  assert.equal(await mail.resolveArchivedZohoMessage(Number(id).toString(), { ...identity, sender_email: 'other@example.com' }), null)
})

test('ambiguous rounded IDs are never guessed', async (t) => {
  const identity = { sender_email: 'client@example.com', subject: 'Hello', received_at: new Date(1787850392225).toISOString() }
  const { mail } = provider(t, ['1787850392225155001', '1787850392225155002'].map((id) => ({
    messageId: id, folderId: 'folder', fromAddress: identity.sender_email, subject: 'Hello', receivedTime: '1787850392225',
  })))
  assert.equal(await mail.resolveArchivedZohoMessage('1787850392225155000', identity), null)
})

function archiveFixture({ cached, fail, leased = false } = {}) {
  const row = { id: 'row', message_id: 'message', subject: 'Hello', sender_email: 'client@example.com', received_at: '2026-08-27T12:00:00Z', metadata: { folderId: 'folder',
    ...(cached ? { cachedMessage: cached } : {}), ...(leased ? { bodySync: { leaseUntil: new Date(Date.now() + 60_000).toISOString() } } : {}) } }
  let reads = 0
  const writes = []
  class ZohoMessageReadError extends Error { constructor(status) { super('Provider unavailable'); this.status = status } }
  const archive = loadTs('src/lib/luxorEmailArchiveServer.ts', {
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      if (!init) return [structuredClone(row)]
      writes.push(url)
      assert.equal(init.method, 'PATCH')
      const expected = new URLSearchParams(url.split('?')[1]).get('metadata').slice(3)
      assert.deepEqual(JSON.parse(expected), row.metadata)
      row.metadata = JSON.parse(init.body).metadata
      return [structuredClone(row)]
    } },
    './zohoMailServer': {
      ZohoMessageReadError, normalizeEmailAddress: (value) => value,
      getLuxorZohoMessageDetail: async () => {
        reads++
        if (fail) throw new ZohoMessageReadError(fail)
        return { id: 'message', folderId: 'folder', content: '<p>Archived</p>', summary: 'Archived' }
      },
      resolveArchivedZohoMessage: async () => { throw new Error('Folder hint should avoid index lookup') },
    },
  })
  return { archive, row, writes, reads: () => reads }
}

test('Supabase cache serves an email without contacting Zoho', async () => {
  const fixture = archiveFixture({ cached: { id: 'message', content: '<p>Offline copy</p>' }, fail: 401 })
  assert.equal((await fixture.archive.getArchivedLuxorEmail('message')).content, '<p>Offline copy</p>')
  assert.equal(fixture.reads(), 0)
  assert.equal(fixture.writes.length, 0)
})

test('successful body retrieval persists once, then survives provider failure', async () => {
  const fixture = archiveFixture()
  await fixture.archive.getArchivedLuxorEmail('message')
  assert.equal(fixture.row.metadata.cachedMessage.content, '<p>Archived</p>')
  assert.equal(fixture.row.metadata.bodySync.nextAttemptAt, null)
  assert.equal(fixture.row.metadata.limitedData, false)
  await fixture.archive.getArchivedLuxorEmail('message')
  assert.equal(fixture.reads(), 1)
})

test('failed reads release the lease and persist a scheduled retry, not a placeholder', async () => {
  const fixture = archiveFixture({ fail: 401 })
  await assert.rejects(fixture.archive.getArchivedLuxorEmail('message'))
  assert.equal(fixture.row.metadata.cachedMessage, undefined)
  assert.equal(fixture.row.metadata.bodySync.leaseUntil, null)
  assert(Date.parse(fixture.row.metadata.bodySync.nextAttemptAt) > Date.now())
})

test('an existing sync lease prevents a second worker from fetching the same body', async () => {
  const fixture = archiveFixture({ leased: true })
  await assert.rejects(fixture.archive.getArchivedLuxorEmail('message'), /syncing in the background/)
  assert.equal(fixture.reads(), 0)
  assert.equal(fixture.writes.length, 0)
})
