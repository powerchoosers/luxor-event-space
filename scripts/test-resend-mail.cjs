/* No credentials, network, or production data. Run with: node scripts/test-resend-mail.cjs */
/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS harness loads transpiled server modules with isolated mocks. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
const nodemailer = require('nodemailer')

function load(file, mocks = {}, cache = new Map()) {
  const resolved = path.resolve(__dirname, '..', file)
  if (cache.has(resolved)) return cache.get(resolved).exports
  const loadedModule = { exports: {} }
  cache.set(resolved, loadedModule)
  const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const localRequire = (name) => {
    if (name === 'server-only') return {}
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(resolved), `${name}.ts`)), mocks, cache)
    return require(name)
  }
  new Function('require', 'module', 'exports', source)(localRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports
}

async function main() {
  const { verifyLuxorResendSignature: verify } = load('src/lib/luxorResendSignature.ts')
  const headers = new Headers({ 'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121',
    'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' })
  const payload = '{"event_type":"ping","data":{"success":true}}'
  const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl'
  assert.equal(verify(payload, headers, secret, 1731705121000), true, 'Published Svix vector')
  assert.equal(verify(`${payload} `, headers, secret, 1731705121000), false, 'Raw-body tampering')
  assert.equal(verify(payload, headers, secret, 1731705422000), false, 'Expired replay')
  assert.equal(verify(payload, headers, secret, 1731704820000), false, 'Future timestamp')
  assert.equal(verify(payload, new Headers(), secret, 1731705121000), false, 'Missing headers')
  headers.set('svix-signature', `v2,invalid v1,bad ${headers.get('svix-signature')}`)
  assert.equal(verify(payload, headers, secret, 1731705121000), true, 'Rotated signing keys')
  console.log('PASS webhook signature, tampering, replay, future dates, missing headers, key rotation')

  process.env.LUXOR_MAIL_PROVIDER = 'zoho'
  process.env.LUXOR_MAIL_FROM = 'booking@luxoratlaspalmas.com'
  process.env.LUXOR_MAIL_ALLOWED_SENDERS = 'booking@luxoratlaspalmas.com,hello@luxoratlaspalmas.com'
  const config = load('src/lib/luxorMailConfig.ts')
  assert.equal(config.luxorMailProvider(), 'zoho')
  process.env.LUXOR_MAIL_PROVIDER = 'resend'
  assert.equal(config.luxorMailProvider(), 'resend')
  assert.throws(() => config.luxorMailFrom('attacker@example.com'))
  assert.equal(config.luxorMailAddress('test@example.com\r\nBcc:x@example.com'), '')
  process.env.LUXOR_MAIL_PROVIDER = 'invalid'
  assert.throws(() => config.luxorMailProvider())
  process.env.LUXOR_MAIL_PROVIDER = 'zoho'
  console.log('PASS explicit provider selection, sender allowlist, header-injection rejection')

  const rows = new Map()
  const history = []
  const mockDb = { supabaseRest: async (url, init = {}) => {
    const params = new URLSearchParams(url.split('?')[1])
    if (init.method === 'POST') {
      const row = JSON.parse(init.body)
      history.push('persist')
      if (!rows.has(row.idempotency_key)) rows.set(row.idempotency_key, { ...row, created_at: new Date().toISOString() })
      return null
    }
    if (init.method === 'PATCH') {
      const row = [...rows.values()].find((r) => `eq.${r.id}` === params.get('id'))
      const status = params.get('status')
      const statusMatches = !status || (status.startsWith('eq.') ? row?.status === status.slice(3) : status.slice(4, -1).split(',').includes(row?.status))
      if (row && statusMatches && (params.get('accepted_at') !== 'is.null' || !row.accepted_at)) Object.assign(row, JSON.parse(init.body))
      return null
    }
    return [...rows.values()].filter((r) => params.get('idempotency_key') === `eq.${r.idempotency_key}`)
  } }
  const mailbox = load('src/lib/luxorMailboxServer.ts', { './supabaseRestServer': mockDb })
  let apiCalls = 0
  let apiHook = () => {}
  let smtpMessage
  const send = load('src/lib/luxorResendMailServer.ts', {
    './supabaseRestServer': mockDb,
    './luxorMailboxServer': { ...mailbox, saveLuxorMailAttachment: async () => history.push('attachment') },
    './luxorResendApiServer': { luxorResendApi: async (_url, init) => {
      history.push('send'); apiCalls++
      assert.equal(typeof init.headers['Idempotency-Key'], 'string')
      apiHook(init.headers['Idempotency-Key'])
      return { id: crypto.randomUUID() }
    } },
    nodemailer: { createTransport: () => ({ sendMail: async (message) => {
      smtpMessage = message
      return { accepted: ['test@example.com'], rejected: [], messageId: message.messageId }
    }, close() {} }) },
  }).sendLuxorResendEmail
  process.env.RESEND_API_KEY = 'test-only-not-a-real-key'
  const input = { to: 'test@example.com', subject: 'Test', content: '<p>Hello</p>', idempotencyKey: 'job/test' }
  const first = await send(input)
  assert.match(first.messageId, /^mail-/)
  assert.equal(history.indexOf('persist') < history.indexOf('send'), true)
  assert.deepEqual(await send(input), first)
  assert.equal(apiCalls, 1, 'Accepted send must not send again')
  await assert.rejects(() => send({ ...input, content: 'different' }), /different content/)
  await assert.rejects(() => send({ ...input, from: 'attacker@example.com' }), /not approved/)
  assert.equal(apiCalls, 1)
  const stored = rows.get('job/test')
  assert.equal(stored.internet_message_id, null, 'API sends must wait for the real provider Message-ID before threaded replies')
  stored.accepted_at = null
  stored.attempted_at = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  await assert.rejects(() => send(input), /reconciliation/)
  console.log('PASS durable pre-send archive, stable retry keys, duplicate protection, changed-payload and expired-retry rejection')

  apiHook = (key) => {
    const row = rows.get(key)
    row.status = 'bounced'
    row.internet_message_id = '<actual-provider-id@example.invalid>'
    row.accepted_at = new Date().toISOString()
  }
  await send({ ...input, idempotencyKey: 'race/bounced' })
  assert.equal(rows.get('race/bounced').status, 'bounced', 'Send completion must not overwrite webhook status')
  assert.equal(rows.get('race/bounced').internet_message_id, '<actual-provider-id@example.invalid>', 'Late send response must preserve the reconciled Internet Message-ID')
  apiHook = (key) => {
    if (key === 'race/timeout') {
      rows.get(key).status = 'delivered'
      rows.get(key).accepted_at = new Date().toISOString()
    }
    throw new Error('simulated network timeout')
  }
  await assert.rejects(() => send({ ...input, idempotencyKey: 'race/timeout' }), /simulated/)
  assert.equal(rows.get('race/timeout').status, 'delivered', 'A late network error must not regress delivery')
  await assert.rejects(() => send({ ...input, idempotencyKey: 'failure/timeout' }), /simulated/)
  assert.equal(rows.get('failure/timeout').status, 'send_unconfirmed')
  apiHook = () => {}
  await send({ ...input, idempotencyKey: 'failure/timeout' })
  assert.equal(rows.get('failure/timeout').status, 'sent')
  await assert.rejects(() => send({ ...input, idempotencyKey: 'bad\r\nkey' }), /delivery key/)
  console.log('PASS early-webhook races, ambiguous timeout handling, safe retry, delivery-key validation')

  const events = []
  const webhook = load('src/lib/luxorResendWebhookServer.ts', {
    './supabaseRestServer': { supabaseRest: async (_url, init) => { events.push(JSON.parse(init.body)); return [] } },
    './luxorZohoWebhookServer': {}, './luxorWebPushServer': {},
  })
  assert.equal(await webhook.storeLuxorResendEvent('other-domain', { type: 'email.received', data: { to: ['someone@example.com'] } }), false)
  assert.equal(await webhook.storeLuxorResendEvent('ours', { type: 'email.received', data: { to: ['Luxor <booking@luxoratlaspalmas.com>'] } }), true)
  assert.equal(await webhook.storeLuxorResendEvent('other-sender', { type: 'email.sent', data: { from: 'another@example.com' } }), false)
  assert.equal(events.length, 1, 'Do not archive unrelated domains in the connected account')
  console.log('PASS account-wide webhook filtering to approved Luxor addresses')

  const build = load('src/lib/luxorCalendarInviteServer.ts', { './luxorResendMailServer': { sendLuxorResendEmail: send } }).buildLuxorCalendarInvite
  const calendarInput = { attendeeEmail: 'test@example.com', attendeeName: 'Test Guest', title: 'Tour — Quinceañera',
    description: 'Line one\nLine two; commas, escaped', location: 'Luxor',
    stamp: new Date('2026-08-27T15:00:00Z'), start: new Date('2026-09-10T15:00:00Z'), end: new Date('2026-09-10T15:30:00Z'), uid: 'test-event@luxoratlaspalmas.com' }
  const calendar = build(calendarInput)
  assert.equal(build(calendarInput), calendar, 'A persisted event revision must generate identical ICS on retry')
  await send({ ...input, idempotencyKey: 'calendar/test', calendar: { content: calendar, method: 'REQUEST', filename: 'invite.ics' } })
  assert.equal(smtpMessage.icalEvent.method, 'REQUEST')
  assert.equal(smtpMessage.headers['Resend-Idempotency-Key'], 'calendar/test')
  assert.equal(smtpMessage.headers['Content-Class'], 'urn:content-classes:calendarmessage')
  assert.match(calendar, /METHOD:REQUEST/)
  assert.match(calendar.replace(/\r\n[ \t]/g, ''), /RSVP=TRUE/)
  assert.match(calendar, /PARTSTAT=NEEDS-ACTION/)
  assert.match(calendar, /ORGANIZER;CN="Luxor Event Space":mailto:booking@luxoratlaspalmas.com/)
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
  const mime = (await transport.sendMail(smtpMessage)).message.toString()
  assert.match(mime, /Content-Type: text\/calendar; charset=utf-8; method=REQUEST/i)
  assert.match(mime, /multipart\/alternative/)
  assert.match(mime, /Content-Class: urn:content-classes:calendarmessage/)
  console.log('PASS calendar REQUEST, organizer, RSVP attendee, Resend SMTP options, actual generated MIME')
}
module.exports = { load }
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1 })
