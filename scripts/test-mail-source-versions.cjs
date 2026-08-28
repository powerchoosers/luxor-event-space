/* Offline version-archive tests: no credentials, network, or real messages. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { load } = require('./test-resend-mail.cjs')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

async function main() {
  const originals = new Map()
  const parts = new Map()
  let reads = 0
  let raw = Buffer.from('From: Guest <guest@example.invalid>\r\nTo: booking@luxoratlaspalmas.com\r\nMessage-ID: <version@example.invalid>\r\nDate: Fri, 28 Aug 2026 10:00:00 +0000\r\nSubject: First version\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOriginal content\r\n')
  const originalBytes = Buffer.from(raw)
  const importer = load('src/lib/luxorZohoImportServer.ts', {
    './zohoMailServer': { getLuxorZohoOriginalMessage: async () => { reads++; return raw } },
    './supabaseRestServer': { supabaseRest: async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null
      if (url === 'rpc/luxor_compare_import_metadata') {
        const row = [...originals.values()].find(m => m.id === body.p_id)
        if (JSON.stringify(row.metadata) !== JSON.stringify(body.p_expected)) return false
        row.metadata = body.p_next; return true
      }
      assert.ok(url.startsWith('luxor_mail_messages?'), 'Version imports cannot send or notify')
      const params = new URLSearchParams(url.split('?')[1])
      if (init.method === 'POST') {
        if (!originals.has(body.provider_id)) originals.set(body.provider_id, body)
        return null
      }
      if (init.method === 'PATCH') {
        const row = [...originals.values()].find(m => m.id === params.get('id').slice(3))
        Object.assign(row, body); return null
      }
      const row = originals.get(params.get('provider_id').slice(3))
      return row ? [structuredClone(row)] : []
    } },
    './luxorMailboxServer': {
      getLuxorMailRow: async id => structuredClone([...originals.values()].find(m => m.id === id.replace(/^mail-/, ''))),
      listLuxorMailAttachments: async id => [...parts.values()].filter(p => p.message_id === id),
      saveLuxorMailAttachment: async file => {
        const saved = { id: crypto.randomUUID(), message_id: file.messageId, source_key: file.sourceKey,
          size_bytes: file.bytes.length, storage_path: `${file.messageId}/${hash(file.bytes)}`, bytes: Buffer.from(file.bytes) }
        parts.set(`${file.messageId}:${file.sourceKey}`, saved); return saved
      },
      downloadLuxorMailAttachment: async (_, id) => ({ bytes: [...parts.values()].find(p => p.id === id).bytes }),
    },
  })
  const input = { accountId: '97001', direction: 'outgoing', staged: true, maxParts: 1,
    folder: { id: '97002', name: 'Drafts', path: '/Drafts', type: 'Drafts' },
    message: { id: '97003', threadId: '97003', folderId: '97002', isRead: true, occurredAt: '2026-08-28T10:00:00Z', source: {} } }
  const initial = await importer.importLuxorZohoMessage(input)
  await importer.verifyLuxorZohoArchive(initial.id)
  const baseline = structuredClone(originals.get('97001:97003'))
  raw = Buffer.from(raw.toString().replace('First version', 'Second version').replace('Original content', 'Updated content'))
  const revision = { passId: '846cb4bc-302f-4b5f-a66b-d43ca08b51f1', expectedSha256: hash(raw) }
  await assert.rejects(() => importer.importLuxorZohoMessage({ ...input, staged: false, revision }), /Invalid staged/)
  await assert.rejects(() => importer.importLuxorZohoMessage({ ...input, revision: { ...revision, expectedSha256: hash(originalBytes) } }), /changed again/)
  assert.equal(originals.size, 1, 'Stale audit must not write a new version')
  const updated = await importer.importLuxorZohoMessage({ ...input, revision })
  assert.notEqual(updated.id, initial.id)
  const verified = await importer.verifyLuxorZohoArchive(updated.id)
  assert.equal(verified.complete, true)
  assert.deepEqual(originals.get('97001:97003'), baseline, 'All earlier message fields remain untouched')
  assert.deepEqual(parts.get(`${baseline.id}:raw-message`).bytes, originalBytes)
  const versionRow = originals.get(`97001:97003:revision:${revision.passId}`)
  assert.equal(versionRow.metadata.sourceRevisionPassId, revision.passId)
  assert.equal(versionRow.metadata.originalSha256, revision.expectedSha256)
  assert.equal(versionRow.metadata.historyStaged, true)
  assert.equal(versionRow.subject, 'Second version')
  const beforeReplay = reads
  await importer.importLuxorZohoMessage({ ...input, revision })
  assert.equal(reads, beforeReplay, 'A completed version retry reuses its verified copy')
  assert.equal(originals.size, 2)
  await assert.rejects(() => importer.importLuxorZohoMessage({ ...input, revision: { ...revision, expectedSha256: 'c'.repeat(64) } }), /saved source revision/)
  // Recover an invalid saved verification offset instead of endlessly retrying it.
  versionRow.metadata.archiveVerificationCursor = { manifestHash: hash(JSON.stringify(versionRow.metadata.archivedParts)), nextIndex: 9999 }
  assert.equal((await importer.verifyLuxorZohoArchive(updated.id, { resume: true, maxParts: 1 })).complete, true)
  console.log('PASS separate source versions, pinned audit hashes, immutable original MIME, staged-only copies, idempotent retries and verification-cursor recovery')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
