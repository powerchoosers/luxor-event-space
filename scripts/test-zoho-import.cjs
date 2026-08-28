/* Offline history migration tests. No real accounts, email, DNS, or database. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const nodemailer = require('nodemailer')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const accountId = '1711540357880100001'
  const messageId = '1711540357880100002'
  const folder = { id: '1711540357880100003', type: 'Inbox', name: 'Inbox', path: '/Inbox' }
  const originalFetch = global.fetch
  const calls = []
  let reply = Response.json({ data: [] })
  Object.assign(process.env, { ZOHO_CLIENT_ID: 'offline', ZOHO_CLIENT_SECRET: 'offline', ZOHO_REFRESH_TOKEN: 'offline',
    ZOHO_ACCOUNT_ID: accountId, LUXOR_ZOHO_LOGIN_EMAIL: 'booking@luxoratlaspalmas.com',
    LUXOR_ZOHO_ALLOWED_SENDERS: 'booking@luxoratlaspalmas.com,hello@luxoratlaspalmas.com' })
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/oauth/v2/token')) return Response.json({ access_token: 'offline-token', expires_in: 3600 })
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal, 'History reads must be bounded')
    return reply.clone()
  }
  try {
    const source = load('src/lib/zohoMailServer.ts', { './supabaseRestServer': { supabaseRest: () => { throw new Error('Source listing must not query the database') } } })
    reply = Response.json({ data: { accountId, mailboxAddress: 'other@example.invalid' } })
    await assert.rejects(() => source.verifyLuxorZohoImportAccount(), /confirm the configured source/)
    reply = Response.json({ data: { accountId, mailboxAddress: 'booking@luxoratlaspalmas.com' } })
    assert.equal((await source.verifyLuxorZohoImportAccount()).accountId, accountId)
    assert.equal(new URL(calls.at(-1).url).pathname, `/api/accounts/${accountId}`)
    reply = new Response(`{"status":{"code":200},"data":[{"folderId":${folder.id},"folderName":"Inbox","folderType":"Inbox","path":"/Inbox"}]}`)
    assert.deepEqual(await source.listLuxorZohoImportFolders(accountId), [folder], 'Numeric Zoho IDs must not lose precision')
    reply = new Response(`{"data":[{"messageId":${messageId},"folderId":${folder.id},"threadId":${messageId},"receivedTime":"1787871600000","status":"0"}]}`)
    const page = await source.listLuxorZohoImportPage({ accountId, folderId: folder.id, start: 1001, limit: 1, status: 'read' })
    assert.equal(page.messages[0].id, messageId)
    assert.equal(page.messages[0].isRead, true, 'Read state comes from documented filter, not numeric status')
    assert.equal(page.nextStart, 1002, 'Migration must continue beyond the UI 1000-message cap')
    const params = new URL(calls.at(-1).url).searchParams
    assert.equal(params.get('start'), '1001')
    assert.equal(params.get('includesent'), 'true')
    assert.equal(params.get('includearchive'), 'true')
    assert.equal(params.get('threadedMails'), 'false')
    reply = Response.json({ data: [] })
    assert.equal((await source.listLuxorZohoImportPage({ accountId, folderId: folder.id, start: 1002, status: 'unread' })).nextStart, null)
    const beforeInvalid = calls.length
    await assert.rejects(() => source.listLuxorZohoImportFolders('other-account'), /no longer matches/)
    await assert.rejects(() => source.listLuxorZohoImportPage({ accountId, folderId: folder.id, start: 0, status: 'read' }), /cursor/)
    await assert.rejects(() => source.listLuxorZohoImportPage({ accountId, folderId: folder.id, start: 1, status: 'all' }), /cursor/)
    await assert.rejects(() => source.listLuxorZohoImportPage({ accountId, folderId: folder.id, start: 1, status: 'read', limit: 201 }), /1–200/)
    assert.equal(calls.length, beforeInvalid)
    reply = Response.json({ status: { code: 403 }, data: [] })
    await assert.rejects(() => source.listLuxorZohoImportFolders(accountId), /rejected/)
    reply = Response.json({ error: 'missing-data' })
    await assert.rejects(() => source.listLuxorZohoImportFolders(accountId), /incomplete/)
    reply = new Response('private provider diagnostic', { status: 403 })
    await assert.rejects(() => source.listLuxorZohoImportFolders(accountId), (error) => /403/.test(error.message) && !/private/.test(error.message))
    reply = new Response(`{"data":{"messageId":${messageId},"content":"From: guest@example.invalid\\r\\n\\r\\nHello"}}`)
    assert.match((await source.getLuxorZohoOriginalMessage(accountId, messageId)).toString(), /Hello/)
    reply = Response.json({ data: { messageId: '2', content: 'wrong message' } })
    await assert.rejects(() => source.getLuxorZohoOriginalMessage(accountId, messageId), /requested complete/)
    console.log('PASS uncapped folder pagination, exact large IDs, documented read-state filters, account binding and fail-closed source errors')

    process.env.LUXOR_ZOHO_CALENDAR_UID = 'calendar-fixture'
    const eventUid = 'saved-event@zoho.com'
    const event = { uid: eventUid, organizer: 'booking@luxoratlaspalmas.com', role: 'organizer', caluid: 'calendar-fixture',
      etag: '1711540357880100007', dateandtime: { start: '20260828T150000Z', end: '20260828T153000Z' } }
    reply = Response.json({ events: [event] })
    const inspected = await source.readLuxorZohoCalendarEvent(eventUid)
    assert.deepEqual(inspected.event, event)
    assert.equal(inspected.event.sequence, undefined, 'Do not mistake an etag for ICS SEQUENCE')
    assert.equal(new URL(calls.at(-1).url).pathname, '/api/v1/calendars/calendar-fixture/events/saved-event%40zoho.com')
    assert.ok(!calls.at(-1).init.method || calls.at(-1).init.method === 'GET', 'Inspection cannot modify the source')
    const callsBeforeInvalid = calls.length
    await assert.rejects(() => source.readLuxorZohoCalendarEvent('../other'))
    assert.equal(calls.length, callsBeforeInvalid)
    for (const changes of [{ uid: 'different@zoho.com' }, { organizer: 'other@example.invalid' }, { role: 'attendee' }, { caluid: 'wrong-calendar' }]) {
      reply = Response.json({ events: [{ ...event, ...changes }] })
      await assert.rejects(() => source.readLuxorZohoCalendarEvent(eventUid), /approved organizer/)
    }
    reply = Response.json({ events: [event, event] })
    await assert.rejects(() => source.readLuxorZohoCalendarEvent(eventUid), /approved organizer/)
    reply = new Response('private provider response', { status: 403 })
    await assert.rejects(() => source.readLuxorZohoCalendarEvent(eventUid), error => /403/.test(error.message) && !/private provider/.test(error.message))
    delete process.env.LUXOR_ZOHO_CALENDAR_UID
    console.log('PASS read-only calendar inspection, exact event/calendar/organizer identity and no invented sequence')
  } finally { global.fetch = originalFetch }

  const calendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:original-zoho-uid\r\nSEQUENCE:4\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  const imageBytes = Buffer.from([0, 1, 2, 200, 255])
  const attachedEmail = Buffer.from('From: other@example.invalid\r\nTo: guest@example.invalid\r\nSubject: Nested original\r\n\r\nNested body')
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, keepBcc: true, newline: 'windows' })
  const raw = (await transport.sendMail({
    from: 'Guest Name <guest@example.invalid>', to: 'booking@luxoratlaspalmas.com', cc: 'second@example.invalid', bcc: 'hidden@example.invalid',
    replyTo: 'reply@example.invalid', messageId: '<historic@example.invalid>', inReplyTo: '<parent@example.invalid>',
    references: ['<root@example.invalid>', '<parent@example.invalid>'], date: new Date('2026-08-27T15:00:00Z'),
    subject: 'History – Quinceañera', text: 'Original plain text', html: '<p>Original HTML<img src="cid:logo"></p>',
    attachments: [{ filename: 'logo.png', content: imageBytes, cid: 'logo', contentType: 'image/png' },
      { filename: 'invite.ics', content: calendar, contentType: 'text/calendar; method=REQUEST' },
      { filename: 'forwarded.eml', content: attachedEmail, contentType: 'message/rfc822', contentTransferEncoding: 'base64' }],
  })).message
  let currentRaw = raw
  let sourceReads = 0
  let row = null
  const stored = new Map()
  const writes = []
  let failAttachment = true
  const importer = load('src/lib/luxorZohoImportServer.ts', {
    './zohoMailServer': { getLuxorZohoOriginalMessage: async (account, id) => {
      assert.equal(account, accountId); assert.equal(id, messageId); sourceReads++; return currentRaw
    } },
    './supabaseRestServer': { supabaseRest: async (url, init = {}) => {
      if (url === 'rpc/luxor_compare_import_metadata') {
        const payload = JSON.parse(init.body)
        if (JSON.stringify(row.metadata) !== JSON.stringify(payload.p_expected)) return false
        row.metadata = payload.p_next
        return true
      }
      assert.ok(url.startsWith('luxor_mail_messages?'), 'Import must not create email jobs, arrivals, or notifications')
      if (init.method === 'POST') { row ||= { ...JSON.parse(init.body), created_at: new Date().toISOString() }; writes.push('message') }
      if (init.method === 'PATCH') { Object.assign(row, JSON.parse(init.body)); writes.push('complete') }
      return row ? [row] : []
    } },
    './luxorMailboxServer': {
      getLuxorMailRow: async () => row,
      listLuxorMailAttachments: async () => [...stored.values()],
      downloadLuxorMailAttachment: async (_messageId, id) => ({ bytes: [...stored.values()].find((file) => file.id === id).bytes }),
      saveLuxorMailAttachment: async (file) => {
        if (failAttachment && file.sourceKey === 'zoho-part-0') throw new Error('Simulated storage outage')
        const saved = { id: crypto.randomUUID(), message_id: file.messageId, source_key: file.sourceKey, size_bytes: file.bytes.byteLength,
          storage_path: `${file.messageId}/${crypto.createHash('sha256').update(file.bytes).digest('hex')}`, bytes: file.bytes }
        stored.set(file.sourceKey, saved); writes.push(file.sourceKey); return saved
      },
    },
  })
  const parsed = await importer.parseLuxorZohoOriginal(raw)
  assert.equal(parsed.internetId, '<historic@example.invalid>')
  assert.equal(parsed.subject, 'History – Quinceañera')
  assert.deepEqual(parsed.replyTo, ['reply@example.invalid'])
  assert.deepEqual(parsed.references, ['<root@example.invalid>', '<parent@example.invalid>'])
  assert.deepEqual(parsed.bcc, ['hidden@example.invalid'])
  assert.match(parsed.html, /cid:logo/)
  assert.equal(parsed.attachments.length, 3, 'Forwarded emails must remain files, not merged into the parent body')
  assert.deepEqual(parsed.attachments.find((a) => a.filename === 'logo.png').bytes, imageBytes)
  assert.equal(parsed.attachments.find((a) => a.filename === 'invite.ics').bytes.toString(), calendar)
  assert.equal(parsed.attachments.find((a) => a.filename === 'forwarded.eml').bytes.toString(), attachedEmail.toString())
  const input = { accountId, folder, direction: 'incoming', message: { id: messageId, threadId: messageId, folderId: folder.id,
    isRead: true, occurredAt: '2026-08-27T15:00:00Z', source: { status: 'not interpreted', messageId } } }
  await assert.rejects(() => importer.importLuxorZohoMessage(input), /storage outage/)
  assert.equal(row.status, 'importing')
  assert.equal(row.metadata.importComplete, false)
  assert.ok(stored.has('raw-message'))
  assert.ok(!writes.includes('complete'), 'Partial attachment failure must never publish a complete archive')
  const stableId = row.id
  failAttachment = false
  const result = await importer.importLuxorZohoMessage(input)
  assert.equal(result.id, `mail-${stableId}`)
  assert.equal(row.status, 'received')
  assert.equal(row.metadata.archivedPartCount, 4)
  assert.equal(row.metadata.importComplete, true)
  assert.equal((await importer.verifyLuxorZohoArchive(result.id, { maxParts: 1 })).complete, false)
  assert.equal(row.metadata.archiveVerifiedAt, null)
  assert.equal(row.metadata.archiveVerificationCursor.nextIndex, 1)
  assert.equal((await importer.verifyLuxorZohoArchive(result.id, { maxParts: 1, resume: true })).verifiedParts, 2)
  assert.equal((await importer.verifyLuxorZohoArchive(result.id, { maxParts: 1, resume: true })).verifiedParts, 3)
  assert.equal((await importer.verifyLuxorZohoArchive(result.id, { maxParts: 1, resume: true })).complete, true)
  assert.equal(row.metadata.archiveVerificationCursor, null)
  assert.equal((await importer.verifyLuxorZohoArchive(result.id)).verifiedParts, 4)
  assert.ok(row.metadata.archiveVerifiedAt)
  const originalImage = stored.get('zoho-part-0').bytes
  stored.get('zoho-part-0').bytes = Buffer.from('corrupt')
  await assert.rejects(() => importer.verifyLuxorZohoArchive(result.id), /integrity check/)
  assert.equal(row.metadata.archiveVerifiedAt, null, 'Failed revalidation must invalidate an older successful verification')
  stored.get('zoho-part-0').bytes = originalImage
  assert.equal(row.thread_key, `mail-zoho-${accountId}-${messageId}`)
  assert.equal(row.internet_message_id, '<historic@example.invalid>')
  assert.equal(writes.filter((key) => key === 'raw-message').length, 1, 'Retry reuses saved source MIME')
  assert.deepEqual(stored.get('raw-message').bytes, raw)
  row.read_at = null
  const beforeReplay = sourceReads
  assert.equal((await importer.importLuxorZohoMessage(input)).alreadyImported, true)
  assert.equal(sourceReads, beforeReplay, 'Complete replay must not reread source or overwrite user read state')
  assert.equal(row.read_at, null)
  row.status = 'importing'; row.metadata.importComplete = false
  currentRaw = Buffer.from(raw.toString().replace('Original plain text', 'Changed plain text'))
  await assert.rejects(() => importer.importLuxorZohoMessage(input), /changed during import/)
  assert.equal(row.metadata.importComplete, false)
  row = null; stored.clear(); writes.length = 0; currentRaw = raw
  for (let part = 0; part < 4; part++) {
    const batch = await importer.importLuxorZohoMessage({ ...input, maxParts: 1, staged: true })
    assert.equal(stored.size, part + 1)
    assert.equal(batch.complete, part === 3)
    assert.equal(row.metadata.historyStaged, true)
  }
  await assert.rejects(() => importer.importLuxorZohoMessage({ ...input, maxParts: 0 }), /batch size/)
  await assert.rejects(() => importer.verifyLuxorZohoArchive(row.id, { maxParts: 0 }), /batch size/)
  console.log('PASS original MIME, Unicode, binary/inline/calendar/forwarded attachments, threading, recovery, immutable replay and read-back integrity checks')

  let selectedRow = { ...row, status: 'received', metadata: { ...row.metadata, importComplete: true } }
  let provider = 'zoho'
  const sent = []
  const replyRoute = load('src/app/api/email/messages/[id]/reply/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'booking@luxoratlaspalmas.com' }) },
    '@/lib/luxorMailConfig': { luxorMailProvider: () => provider },
    '@/lib/zohoMailServer': { normalizeEmailAddress: (value) => value, getLuxorZohoMessageDetail: () => { throw new Error('Must use complete archive') },
      replyLuxorZohoEmail: async (input) => { sent.push({ provider: 'zoho', ...input }); return input } },
    '@/lib/luxorMailboxServer': { resolveLuxorMailboxRow: async () => selectedRow,
      getLuxorMailboxMessage: async () => ({ id: `mail-${stableId}`, direction: 'incoming', from: parsed.from,
        to: parsed.to[0], subject: parsed.subject, threadId: row.thread_key }) },
    '@/lib/luxorNotesServer': {},
    '@/lib/luxorResendMailServer': { sendLuxorResendEmail: async (input) => { sent.push({ provider: 'resend', ...input }); return input } },
    '@/lib/luxorResendApiServer': { luxorResendApi: () => { throw new Error('Zoho IDs must never be fetched from Resend') } },
  })
  const submit = () => replyRoute.POST(new Request(`https://example.invalid/api/email/messages/${messageId}/reply`, {
    method: 'POST', body: JSON.stringify({ content: 'Offline reply', deliveryKey: 'offline-reply-key' }),
  }), { params: Promise.resolve({ id: messageId }) })
  assert.equal((await submit()).status, 200)
  assert.equal(sent[0].provider, 'zoho', 'Staged import must not silently switch ordinary delivery')
  assert.equal(sent[0].messageId, messageId, 'Zoho receives its source identifier, not the local UUID')
  provider = 'resend'
  assert.equal((await submit()).status, 200)
  assert.equal(sent[1].inReplyTo, '<historic@example.invalid>')
  assert.equal(sent[1].to, 'reply@example.invalid')
  assert.equal(sent[1].idempotencyKey, 'reply/offline-reply-key')
  selectedRow = { ...selectedRow, internet_message_id: null }
  assert.equal((await submit()).status, 400)
  selectedRow = null
  assert.equal((await submit()).status, 400)
  assert.equal(sent.length, 2, 'Incomplete migration cannot silently fall back to Zoho after cutover')
  console.log('PASS legacy reply links, original transport before cutover, Resend reply headers after cutover and missing-ID guards')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
