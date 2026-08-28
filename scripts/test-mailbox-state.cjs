/* Offline mailbox regressions: no credentials, network, or production data. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const folders = load('src/lib/luxorMailFolders.ts')
  const imported = (type, path, direction = 'incoming', folderId = '90002', account = '90001') => ({ direction,
    metadata: { source: 'zoho-history-import', zohoAccountId: account,
      zohoFolder: { id: folderId, type, path, name: path.split('/').pop() } } })
  for (const name of ['Inbox', 'Sent', 'Drafts', 'Templates', 'Spam', 'Trash', 'Outbox']) {
    const mapped = folders.luxorMailFolder(imported(name, `/${name}`, 'outgoing'))
    assert.equal(mapped.folder, name.toLowerCase())
    assert.equal(mapped.folderId, 'zoho-90001-90002')
    assert.equal(mapped.folderPath, `/${name}`)
  }
  assert.equal(folders.luxorMailFolder(imported('Inbox', '/Clients/Quinceañeras')).folder, 'zoho-90001-90002')
  assert.equal(folders.luxorMailFolder(imported('Inbox', '/Clients/Inbox')).folder, 'zoho-90001-90002')
  assert.equal(folders.luxorMailFolder(imported('Inbox', '/Drafts')).folder, 'zoho-90001-90002', 'Type and path must agree')
  assert.notEqual(folders.luxorMailFolder(imported('Inbox', '/Clients', 'incoming', '90002', '90003')).folder, 'zoho-90001-90002')
  assert.throws(() => folders.luxorMailFolder({ direction: 'incoming', metadata: { source: 'zoho-history-import' } }), /folder identity/)
  assert.equal(folders.luxorMailMatchesFolder({ direction: 'outgoing', folder: 'drafts' }, 'sent'), false)
  assert.equal(folders.luxorMailMatchesFolder({ direction: 'incoming', folder: 'spam' }, 'inbox'), false)
  assert.equal(folders.luxorMailMatchesFolder({ direction: 'outgoing', folder: 'outbox' }, 'sent'), true)
  assert.equal(folders.luxorMailMatchesFolder({ direction: 'campaign' }, 'sent'), true)
  assert.equal(folders.luxorMailMatchesFolder({ folder: 'zoho-90001-90002' }, 'zoho-90001-90002'), true)
  assert.equal(folders.isLuxorMailFolderFilter('zoho-90001-90002),or(id.not.is.null'), false)
  assert.throws(() => folders.luxorMailFolderCondition('untrusted'), /Invalid/)
  assert.match(folders.luxorMailFolderCondition('inbox'), /zohoFolder->>path.eq.\/Inbox/)
  assert.match(folders.luxorMailFolderCondition('sent'), /zohoFolder->>path.eq.\/Outbox/)
  assert.match(folders.luxorMailFolderCondition('zoho-90001-90002'), /zohoAccountId.eq.90001/)
  const catalog = folders.luxorMailFolderCatalog('90001', [imported('Inbox', '/Empty').metadata.zohoFolder])
  assert.deepEqual(folders.luxorMailAdditionalFolders(catalog, []), [{ value: 'zoho-90001-90002', label: '/Empty', count: 0 }])
  assert.equal(folders.luxorMailAdditionalFolders(catalog, [{ folder: 'zoho-90001-90002' }])[0].count, 1)
  assert.equal(folders.luxorMailAdditionalFolders(catalog, [{ folder: 'inbox' }]).length, 1)
  const retained = imported('Inbox', '/Inbox')
  retained.metadata.historyMissingFromSource = true
  assert.equal(folders.luxorMailFolder(retained).folder, 'retained')
  assert.match(folders.luxorMailFolderCondition('retained'), /historyMissingFromSource.eq.true/)
  assert.match(folders.luxorMailFolderCondition('inbox'), /historyMissingFromSource.neq.true/)
  console.log('PASS source-folder identity, custom hierarchy, system-folder classification and injection-safe filters')
  const id = '34eca311-4291-4174-961b-252e80e5669b'
  const localId = `mail-${id}`
  const requests = []
  let readAt = null
  let exists = true
  let dbFails = false
  const row = { id, direction: 'incoming', thread_key: 'mail-thread', subject: 'Offline test',
    from_address: 'guest@example.invalid', to_addresses: ['booking@luxoratlaspalmas.com'], cc_addresses: [],
    occurred_at: '2026-08-28T00:00:00Z', text_body: 'Test', html_body: '<img src="cid:logo">',
    read_at: null, status: 'received', metadata: {} }
  const attachments = [
    { id: 'logo-id', message_id: id, source_key: 'logo', filename: 'logo.png', content_type: 'image/png', content_id: '<logo>', size_bytes: 10 },
    { id: 'raw-id', message_id: id, source_key: 'raw-message', filename: 'message.eml', content_type: 'message/rfc822', size_bytes: 100 },
  ]
  const mailbox = load('src/lib/luxorMailboxServer.ts', { './supabaseRestServer': { supabaseRest: async (url, init = {}) => {
    requests.push({ url, init })
    if (dbFails) throw new Error('Private database diagnostic must not leak')
    if (init.method === 'PATCH') {
      assert.equal(new URLSearchParams(url.split('?')[1]).get('direction'), 'eq.incoming')
      assert.equal(init.headers.Prefer, 'return=representation')
      readAt = JSON.parse(init.body).read_at
      return exists ? [{ id, read_at: readAt }] : []
    }
    if (url.startsWith('luxor_mail_attachments?')) return attachments
    return exists ? [{ ...row, read_at: readAt }] : []
  } } })
  assert.deepEqual(await mailbox.setLuxorMailboxRead(localId, true), { id: localId, isRead: true })
  assert.ok(Number.isFinite(Date.parse(readAt)))
  assert.deepEqual(await mailbox.setLuxorMailboxRead(localId, false), { id: localId, isRead: false })
  assert.equal(readAt, null)
  await assert.rejects(() => mailbox.setLuxorMailboxRead('invalid&direction=eq.outgoing', true), /Invalid mailbox/)
  exists = false
  assert.equal(await mailbox.setLuxorMailboxRead(localId, true), null)
  exists = true
  const beforeList = requests.length
  const list = await mailbox.listLuxorMailboxMessages({ threadId: 'mail-thread', withAttachments: true })
  assert.equal(requests.length - beforeList, 2, 'One batched attachment query, not one query per message')
  assert.equal(list[0].attachments.length, 1, 'Raw MIME is private archival data, not a visible attachment')
  assert.match(list[0].htmlContent, /\/api\/email\/attachments\/mail-/)
  assert.equal(list[0].deliveryStatus, undefined, 'Incoming mail has no outgoing delivery status')
  assert.equal(mailbox.luxorMailMessage({ ...row, direction: 'outgoing', status: 'send_unconfirmed' }).deliveryStatus, 'send_unconfirmed')
  assert.equal(mailbox.luxorMailMessage({ ...row, metadata: { fromName: 'Guest Name' } }).from, 'Guest Name <guest@example.invalid>')
  const listQuery = new URLSearchParams(requests.find(r => r.url.startsWith('luxor_mail_messages?') && r.url.includes('order=')).url.split('?')[1])
  assert.match(listQuery.get('and'), /historyStaged/, 'Staged bulk imports must not appear in the live inbox')
  assert.match(listQuery.get('and'), /historySuperseded/, 'Older versions must not duplicate canonical messages')
  await mailbox.listLuxorMailboxMessages({ folder: 'drafts', limit: 1 })
  const draftQuery = new URLSearchParams(requests.at(-1).url.split('?')[1])
  assert.equal(draftQuery.get('direction'), null, 'A draft is not selected by sender direction')
  assert.match(draftQuery.get('and'), /zohoFolder->>path.eq.\/Drafts/, 'Folder filtering must happen before the database limit')
  let replacementQueries = 0
  const replacementMailbox = load('src/lib/luxorMailboxServer.ts', { './supabaseRestServer': { supabaseRest: async (url) => {
    replacementQueries++
    const params = new URLSearchParams(url.split('?')[1])
    assert.equal(params.get('metadata->>importComplete'), 'eq.true')
    assert.match(params.get('or'), /historyStaged/)
    assert.match(params.get('and'), /historySuperseded/)
    assert.equal(params.get('direction'), null)
    assert.equal(params.has('order'), false, 'Legacy suppression cannot depend on the newest message window')
    return [{ legacy_id: '90004' }]
  } } })
  assert.deepEqual([...await replacementMailbox.findLuxorImportedLegacyIds(['90004', '90004', 'not-numeric'])], ['90004'])
  assert.equal(replacementQueries, 1)
  await replacementMailbox.findLuxorImportedLegacyIds(Array.from({ length: 101 }, (_, index) => String(index)))
  assert.equal(replacementQueries, 3, 'Large ID collections use bounded query batches')
  row.metadata.historyStaged = true
  await assert.rejects(() => mailbox.getLuxorMailboxMessage(localId), /reconciliation/)
  row.metadata.historyStaged = false
  exists = false
  const beforeEmpty = requests.length
  assert.deepEqual(await mailbox.listLuxorMailboxMessages({ withAttachments: true }), [])
  assert.equal(requests.length - beforeEmpty, 1, 'Empty threads do not query every attachment')
  exists = true
  console.log('PASS read-state persistence, incoming-only writes, ID validation, batched thread attachments and private raw-MIME filtering')

  const manyParts = Array.from({ length: 1001 }, (_, index) => ({ id: String(index) }))
  let attachmentPages = 0
  const uncapped = load('src/lib/luxorMailboxServer.ts', { './supabaseRestServer': { supabaseRest: async (url) => {
    const params = new URLSearchParams(url.split('?')[1]); attachmentPages++
    assert.equal(params.get('order'), 'created_at.asc,id.asc')
    return manyParts.slice(Number(params.get('offset')), Number(params.get('offset')) + Number(params.get('limit')))
  } } })
  assert.equal((await uncapped.listLuxorMailAttachments(localId)).length, 1001)
  assert.equal(attachmentPages, 3)

  let session = null
  const route = load('src/app/api/email/messages/[id]/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
    '@/lib/zohoMailServer': {}, '@/lib/luxorEmailArchiveServer': {}, '@/lib/luxorMarketingServer': {},
    '@/lib/supabaseRestServer': {}, '@/lib/luxorMailboxServer': mailbox,
  })
  const patch = (body, headers = {}, messageId = localId) => route.PATCH(new Request(`https://luxor.example.invalid/api/email/messages/${messageId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: messageId }) })
  const beforeDenied = requests.length
  assert.equal((await patch({ isRead: true })).status, 401)
  session = { email: 'booking@luxoratlaspalmas.com' }
  assert.equal((await patch({ isRead: true }, { origin: 'https://attacker.example.invalid' })).status, 403)
  assert.equal((await patch({ isRead: true }, { 'sec-fetch-site': 'cross-site' })).status, 403)
  assert.equal((await patch({ isRead: 'true' })).status, 400)
  assert.equal((await patch(null)).status, 400)
  assert.equal((await patch({ isRead: true }, {}, 'zoho-message')).status, 400)
  assert.equal(requests.length, beforeDenied, 'Rejected requests must not touch database')
  const saved = await patch({ isRead: true }, { origin: 'https://luxor.example.invalid' })
  assert.equal(saved.status, 200)
  assert.equal(saved.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await saved.json(), { id: localId, isRead: true })
  exists = false
  assert.equal((await patch({ isRead: false })).status, 404)
  dbFails = true
  const failed = await patch({ isRead: false })
  assert.equal(failed.status, 503)
  assert.doesNotMatch(await failed.text(), /Private database/)
  console.log('PASS mailbox PATCH authentication, cross-site protection, strict input, not-found and sanitized retryable failures')

  const { luxorMailDeliveryLabel: label } = load('src/lib/luxorMailDelivery.ts')
  assert.equal(label('sent'), 'Accepted for delivery')
  assert.equal(label('delivered'), 'Delivered')
  assert.match(label('send_unconfirmed'), /unconfirmed/)
  assert.match(label('suppressed'), /Not sent/)
  assert.equal(label('unrecognized'), 'Delivery status unavailable')
  assert.equal(label(), '')
  console.log('PASS accurate delivery labels distinguish acceptance, delivery, suppression and uncertainty')

  let inboxSession = { email: 'booking@luxoratlaspalmas.com' }
  let queriedFolder
  const inboxRoute = load('src/app/api/email/inbox/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => inboxSession },
    '@/lib/zohoMailServer': {}, '@/lib/luxorMarketingServer': { listMarketingCampaigns: async () => [] },
    '@/lib/luxorTextUtils': { decodeHtmlEntities: (value) => value },
    '@/lib/luxorMailConfig': { luxorMailProvider: () => 'resend' },
    '@/lib/luxorMailFolders': folders,
    '@/lib/luxorMailboxServer': {
      listLuxorReleasedMailFolders: async () => catalog,
      listLuxorMailboxMessages: async ({ folder }) => { queriedFolder = folder; return [] },
      findLuxorImportedLegacyIds: async (ids) => { assert.deepEqual(ids, ['90004']); return new Set(['90004']) },
    },
    '@/lib/supabaseRestServer': { supabaseRest: async (url) => url.startsWith('luxor_email_events?')
      ? [{ id: 'event-fixture', message_id: '90004', sender_email: 'guest@example.invalid', subject: 'Moved to spam', received_at: '2026-08-28T00:00:00Z' }] : [] },
  })
  const inbox = (folder) => inboxRoute.GET(new Request(`https://luxor.example.invalid/api/email/inbox?folder=${encodeURIComponent(folder)}`))
  assert.deepEqual((await (await inbox('inbox')).json()).messages, [], 'A moved import cannot reappear via its legacy Inbox preview')
  assert.equal(queriedFolder, 'inbox')
  assert.deepEqual((await (await inbox('inbox')).json()).folders, catalog, 'Empty released folders reach the authenticated mailbox')
  assert.equal((await inbox('zoho-90001-90002')).status, 200)
  assert.equal((await inbox('bad,filter')).status, 400)
  inboxSession = null
  assert.equal((await inbox('inbox')).status, 401)
  console.log('PASS folder API authentication, input validation and cross-folder legacy-preview suppression')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
