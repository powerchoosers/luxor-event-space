/* Offline orchestration and authorization tests; no real mail or database. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const folder = { id: '11001', type: 'Inbox', path: '/Inbox', name: 'Inbox' }
  const stamp = () => new Date().toISOString()
  let run = null
  let comparison = null
  let contentItems = []
  let originalReads = 0
  const originalBytes = Buffer.from('Original MIME with Unicode: Quinceañera\r\n')
  const originalHash = createHash('sha256').update(originalBytes).digest('hex')
  let items = []
  let sourceFailure = false
  let storageFailure = false
  let verifyComplete = false
  let archiveComplete = false
  let changedAccount = false
  let listCount = 0
  const operations = []
  const archiveInputs = []
  const account = { accountId: '10001', mailbox: 'booking@luxoratlaspalmas.com', senders: ['booking@luxoratlaspalmas.com'] }
  const worker = load('src/lib/luxorMailImportServer.ts', {
    './luxorMailReleaseServer': { getLuxorMailReleaseReview: async () => null },
    './zohoMailServer': {
      getLuxorZohoImportAccount: () => ({ ...account, mailbox: changedAccount ? 'changed@example.invalid' : account.mailbox }),
      verifyLuxorZohoImportAccount: async () => account,
      getLuxorZohoOriginalMessage: async (accountId, id) => {
        assert.equal(accountId, account.accountId); assert.match(id, /^\d+$/)
        originalReads++
        if (sourceFailure) throw new Error('private original message content')
        return originalBytes
      },
      listLuxorZohoImportFolders: async () => { listCount++; if (sourceFailure) throw new Error('private folder data'); return [folder] },
      normalizeEmailAddress: (address) => address,
      listLuxorZohoImportPage: async (input) => {
        assert.equal(input.limit, 100)
        assert.equal(input.accountId, account.accountId)
        if (sourceFailure) throw new Error('private source payload')
        return { messages: [], nextStart: null }
      },
    },
    './luxorMailboxServer': { mailLocalId: (id) => id.replace(/^mail-/, '') },
    './luxorZohoImportServer': {
      importLuxorZohoMessage: async (input) => {
        archiveInputs.push(input)
        assert.equal(input.staged, true); assert.equal(input.maxParts, 1)
        operations.push('archive')
        if (storageFailure) throw new Error('private storage payload')
        return { id: 'mail-12345678-1234-1234-1234-123456789012', complete: archiveComplete }
      },
      verifyLuxorZohoArchive: async (_id, input) => {
        assert.deepEqual(input, { maxParts: 1, resume: true })
        operations.push('verify')
        return { complete: verifyComplete, verifiedAt: verifyComplete ? stamp() : null }
      },
    },
    './supabaseRestServer': { supabaseRest: async (url, init = {}) => {
      assert.ok(init.signal)
      assert.ok(!/email_jobs|resend|notifications/.test(url), 'Import cannot send or notify')
      const body = init.body ? JSON.parse(init.body) : {}
      if (url.startsWith('luxor_mail_source_passes?')) return comparison ? [structuredClone(comparison)] : []
      if (url.startsWith('luxor_mail_source_observations?')) {
        assert.ok(url.includes(`pass_id=eq.${comparison.id}`))
        assert.ok(url.includes(`source_sha256=eq.${originalHash}`))
        return [{ folder: { ...folder, type: 'Drafts', path: '/Drafts' }, message: { ...items[0].message, source: {} } }]
      }
      if (url === 'rpc/luxor_archive_mail_source_changes') {
        assert.equal(body.p_pass_id, comparison.id)
        items[0].target_pass_id = comparison.id; items[0].target_sha256 = originalHash
        Object.assign(items[0], { status: 'pending', local_message_id: null, next_attempt_at: stamp() })
        Object.assign(run, { status: 'active', phase: 'archive' }); return true
      }
      if (url === 'rpc/luxor_control_mail_import') {
        if (body.p_action === 'pause') {
          if (run.status !== 'active') return false
          run.status = 'paused'; return true
        }
        if (run.status === 'active' || (run.lease_until && Date.parse(run.lease_until) > Date.now())) return false
        const sourceActive = comparison && (comparison.status !== 'complete' || comparison.content_status === 'checking')
        if (body.p_action === 'resume' && run.phase === 'reconcile' && !sourceActive) return false
        if (body.p_action === 'retry_failed') {
          if (sourceActive || !items.some(i => i.status === 'failed')) return false
          for (const item of items.filter(i => i.status === 'failed')) Object.assign(item, { status: 'pending', failures: 0, next_attempt_at: stamp() })
          run.phase = 'archive'
        }
        Object.assign(run, { status: 'active', lease_token: null, lease_until: null, next_attempt_at: stamp() })
        return true
      }
      if (url === 'rpc/luxor_start_mail_source_pass') {
        assert.equal(body.p_expected_generation, comparison?.generation || 0)
        comparison = { id: 'source-pass', generation: (comparison?.generation || 0) + 1,
          status: 'scanning', content_status: 'not_started', folders: [folder], folder_index: 0, stream: 'read', page_start: 1, report: null }
        run.status = 'active'; return true
      }
      if (url === 'rpc/luxor_commit_mail_source_page') {
        assert.equal(body.p_pass_id, comparison.id); assert.equal(body.p_token, run.lease_token)
        assert.deepEqual(body.p_messages, [])
        comparison.status = 'finalizing'; run.lease_token = null; run.lease_until = null; return true
      }
      if (url === 'rpc/luxor_finish_mail_source_pass') {
        assert.equal(body.p_pass_id, comparison.id); assert.equal(body.p_token, run.lease_token)
        assert.deepEqual(body.p_folders, [folder])
        comparison.status = 'complete'; comparison.report = { matchesPrevious: true }
        run.status = 'review'; run.lease_token = null; run.lease_until = null; return true
      }
      if (url === 'rpc/luxor_start_mail_source_content') {
        assert.equal(body.p_pass_id, comparison.id)
        comparison.content_status = 'checking'; run.status = 'active'; return true
      }
      if (url === 'rpc/luxor_next_mail_source_content') {
        const item = contentItems.find(i => i.status === 'pending' && Date.parse(i.nextAttemptAt) <= Date.now())
        return item ? { sourceMessageId: item.id, archive: item.archive } : null
      }
      if (url === 'rpc/luxor_commit_mail_source_content') {
        assert.equal(body.p_token, run.lease_token)
        const item = contentItems.find(i => i.id === body.p_message_id)
        assert.deepEqual(body.p_expected_archive, item.archive)
        if (body.p_read_failed) {
          assert.equal(body.p_source_sha256, null)
          item.failures++; item.status = item.failures >= 5 ? 'unavailable' : 'pending'
          item.nextAttemptAt = new Date(Date.now() + 60000).toISOString()
        } else {
          assert.equal(body.p_source_sha256, item.archive.sha256 ? originalHash : null)
          item.status = !item.archive.sha256 ? 'unarchived' : item.archive.sha256 === originalHash ? 'matching' : 'different'
        }
        run.lease_token = null; run.lease_until = null; return true
      }
      if (url === 'rpc/luxor_mail_source_content_counts') {
        return { total: contentItems.length, ...Object.fromEntries(['pending','matching','different','unarchived','unavailable']
          .map(status => [status, contentItems.filter(i => i.status === status).length])),
          nextAttemptAt: contentItems.find(i => i.status === 'pending')?.nextAttemptAt || null }
      }
      if (url === 'rpc/luxor_finish_mail_source_content') {
        assert.equal(body.p_token, run.lease_token)
        assert.ok(contentItems.every(i => i.status !== 'pending'))
        comparison.content_status = 'complete'; comparison.content_completed_at = stamp()
        run.status = 'review'; run.lease_token = null; run.lease_until = null; return true
      }
      if (url === 'rpc/luxor_mail_import_counts') {
        return { total: items.length, pending: items.filter(i => i.status === 'pending').length,
          verifying: items.filter(i => i.status === 'verifying').length, verified: items.filter(i => i.status === 'verified').length,
          failed: items.filter(i => i.status === 'failed').length, sourceConflicts: 0 }
      }
      if (url === 'rpc/luxor_commit_mail_import_page') {
        assert.equal(body.p_token, run.lease_token)
        run.phase = 'archive'; run.lease_token = null; run.lease_until = null
        return true
      }
      if (url === 'rpc/luxor_commit_mail_import_item') {
        assert.equal(body.p_token, run.lease_token)
        const item = items.find(i => i.id === body.p_item_id)
        Object.assign(item, { status: body.p_status, local_message_id: body.p_local_id, failures: body.p_failures,
          next_attempt_at: body.p_next_attempt, last_error: body.p_error, verified_at: body.p_verified_at })
        run.lease_token = null; run.lease_until = null
        return true
      }
      if (url.startsWith('luxor_mail_import_runs?')) {
        if (init.method === 'POST') {
          run ||= { ...body, id: '11111111-1111-1111-1111-111111111111', status: 'active', phase: 'inventory',
            stream: 'read', folder_index: 0, page_start: 1, failures: 0, lease_token: null, lease_until: null,
            next_attempt_at: stamp(), created_at: stamp(), updated_at: stamp() }
        } else if (init.method === 'PATCH') {
          if (url.includes('next_attempt_at=lte.') && (Date.parse(run.next_attempt_at) > Date.now()
            || (run.lease_until && Date.parse(run.lease_until) > Date.now()))) return []
          Object.assign(run, body)
        }
        return run ? [structuredClone(run)] : []
      }
      if (url.startsWith('luxor_mail_import_items?')) {
        if (init.method === 'PATCH') { for (const item of items.filter(i => i.status === 'failed')) Object.assign(item, body); return null }
        return items.filter(i => ['pending', 'verifying'].includes(i.status) && Date.parse(i.next_attempt_at) <= Date.now()).slice(0, 1).map(i => structuredClone(i))
      }
      throw new Error(`Unexpected database operation: ${url}`)
    } },
  })
  assert.deepEqual(await worker.getLuxorMailImportStatus(), { run: null })
  await assert.rejects(() => worker.stepLuxorMailImport(), /Start/)
  await worker.startLuxorMailImport('owner@example.invalid')
  await worker.startLuxorMailImport('owner@example.invalid')
  assert.equal(listCount, 1, 'Duplicate start must resume the same inventory')
  changedAccount = true
  await assert.rejects(() => worker.stepLuxorMailImport(), /mailbox changed/)
  changedAccount = false
  sourceFailure = true
  assert.equal((await worker.stepLuxorMailImport()).retryPending, true)
  assert.equal(run.phase, 'inventory')
  assert.equal(run.page_start, 1)
  assert.ok(!run.last_error.includes('private'))
  assert.equal((await worker.stepLuxorMailImport()).worked, false, 'Backoff must not refetch source')
  sourceFailure = false; run.next_attempt_at = stamp()
  run.lease_until = new Date(Date.now() + 300_000).toISOString(); run.lease_token = 'busy'
  assert.equal((await worker.stepLuxorMailImport()).worked, false, 'Active lease prevents overlapping work')
  await worker.controlLuxorMailImport('pause')
  assert.equal(run.lease_token, 'busy')
  await assert.rejects(() => worker.controlLuxorMailImport('resume'), /finishing/)
  run.lease_until = null; run.lease_token = null
  await worker.controlLuxorMailImport('resume')
  assert.equal((await worker.stepLuxorMailImport()).phase, 'inventory')
  items = [{ id: 'item-1', run_id: run.id, source_message_id: '12001', folder, failures: 0,
    message: { id: '12001', folderId: folder.id, threadId: '12001', isRead: true, source: {} },
    status: 'pending', local_message_id: null, next_attempt_at: stamp() }]
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'pending', 'A partial archive must not advance to verification')
  archiveComplete = true
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'verifying')
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'verifying', 'A partial integrity check must not mark the item verified')
  verifyComplete = true
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'verified')
  await worker.stepLuxorMailImport()
  assert.equal(run.status, 'review'); assert.equal(run.phase, 'reconcile')
  assert.equal((await worker.getLuxorMailImportStatus()).run.readyForCutover, false)
  await assert.rejects(() => worker.controlLuxorMailImport('resume'), /reconciliation/)
  items[0].status = 'failed'; items[0].failures = 5
  await worker.controlLuxorMailImport('retry_failed')
  assert.equal(run.phase, 'archive'); assert.equal(items[0].status, 'pending')
  items[0].failures = 4; storageFailure = true
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'failed')
  assert.ok(!items[0].last_error.includes('private storage payload'))
  assert.ok(!JSON.stringify(await worker.getLuxorMailImportStatus()).includes('account_id'))
  console.log('PASS durable start, account pinning, retries, leases, pause/resume, bounded archive/verification, failure isolation and mandatory reconciliation')

  await assert.rejects(() => worker.startLuxorMailSourceComparison(), /Finish/)
  await worker.stepLuxorMailImport() // drain the failed archive into review
  const archiveOperations = operations.length
  await worker.startLuxorMailSourceComparison()
  assert.equal(comparison.generation, 1)
  const summary = await worker.getLuxorMailImportStatus()
  assert.equal(summary.run.reconciliation.currentFolder, folder.path)
  assert.ok(!JSON.stringify(summary).includes('source-pass'), 'Internal source identifiers stay private')
  sourceFailure = true
  assert.equal((await worker.stepLuxorMailImport()).retryPending, true)
  assert.equal(comparison.status, 'scanning', 'Failed source page cannot advance')
  assert.ok(!run.last_error.includes('private'))
  sourceFailure = false; run.next_attempt_at = stamp()
  await worker.controlLuxorMailImport('pause')
  await assert.rejects(() => worker.controlLuxorMailImport('retry_failed'), /reconciliation/)
  await worker.controlLuxorMailImport('resume')
  assert.equal((await worker.stepLuxorMailImport()).phase, 'reconcile')
  assert.equal(comparison.status, 'finalizing')
  sourceFailure = true
  assert.equal((await worker.stepLuxorMailImport()).retryPending, true)
  assert.equal(comparison.status, 'finalizing', 'Failed closing folder inventory cannot finalize')
  sourceFailure = false; run.next_attempt_at = stamp()
  assert.equal((await worker.stepLuxorMailImport()).worked, true)
  assert.equal(comparison.status, 'complete')
  assert.equal((await worker.getLuxorMailImportStatus()).run.readyForCutover, false, 'Matching inventories alone never certify cutover')
  assert.equal(operations.length, archiveOperations, 'Comparison does not rewrite archived MIME')
  assert.equal((await worker.stepLuxorMailImport()).worked, false)
  await worker.startLuxorMailSourceComparison()
  assert.equal(comparison.generation, 2)
  console.log('PASS explicit source comparison, isolated cursors, resumable reads, closing folder check, private reports and no premature cutover')

  await assert.rejects(() => worker.startLuxorMailSourceContent(), /Finish/)
  await worker.stepLuxorMailImport(); await worker.stepLuxorMailImport()
  contentItems = [originalHash, 'b'.repeat(64), null, originalHash].map((sha256, index) => ({
    id: String(13001 + index), archive: { id: sha256 ? '12345678-1234-1234-1234-123456789012' : null, sha256 },
    status: 'pending', nextAttemptAt: stamp(), failures: 0,
  }))
  await worker.startLuxorMailSourceContent()
  await assert.rejects(() => worker.startLuxorMailSourceContent(), /Finish/)
  assert.equal((await worker.getLuxorMailImportStatus()).run.reconciliation.content.counts.pending, 4)
  await worker.stepLuxorMailImport()
  assert.equal(contentItems[0].status, 'matching'); assert.equal(originalReads, 1)
  await worker.stepLuxorMailImport()
  assert.equal(contentItems[1].status, 'different'); assert.equal(originalReads, 2)
  await worker.stepLuxorMailImport()
  assert.equal(contentItems[2].status, 'unarchived'); assert.equal(originalReads, 2, 'Unverified archive must not cause a false comparison')
  await worker.controlLuxorMailImport('pause')
  await assert.rejects(() => worker.controlLuxorMailImport('retry_failed'), /reconciliation/)
  await worker.controlLuxorMailImport('resume')
  sourceFailure = true
  await worker.stepLuxorMailImport()
  assert.equal(contentItems[3].status, 'pending')
  assert.equal((await worker.stepLuxorMailImport()).retryPending, true)
  assert.equal(originalReads, 3, 'Backoff cannot repeatedly read the source')
  assert.equal((await worker.stepLuxorMailImport()).worked, false)
  for (let n = 0; n < 4; n++) {
    contentItems[3].nextAttemptAt = stamp(); run.next_attempt_at = stamp()
    await worker.stepLuxorMailImport()
  }
  assert.equal(contentItems[3].status, 'unavailable')
  sourceFailure = false
  await worker.stepLuxorMailImport()
  const audited = (await worker.getLuxorMailImportStatus()).run
  assert.equal(audited.reconciliation.content.status, 'complete')
  assert.equal(audited.reconciliation.content.counts.matching, 1)
  assert.equal(audited.readyForCutover, false)
  assert.ok(!JSON.stringify(audited).includes(originalHash))
  assert.ok(!JSON.stringify(audited).includes('private original'))
  assert.equal(operations.length, archiveOperations, 'Source audit cannot rewrite the original archive')
  await assert.rejects(() => worker.startLuxorMailSourceContent(), /fresh source comparison/)
  console.log('PASS bounded source MIME hashing, incomplete archive isolation, pause/resume, read retries, safe audit counts and preserved history')

  comparison.id = '846cb4bc-302f-4b5f-a66b-d43ca08b51f1'
  items = [{ id: 'version-item', status: 'verified', failures: 0, source_message_id: '13002', folder,
    message: { id: '13002', threadId: '13002', folderId: folder.id, source: {} }, next_attempt_at: stamp() }]
  await worker.archiveLuxorMailSourceChanges()
  await assert.rejects(() => worker.archiveLuxorMailSourceChanges(), /Finish/)
  archiveComplete = true; verifyComplete = true; storageFailure = false
  await worker.stepLuxorMailImport()
  assert.deepEqual(archiveInputs.at(-1).revision, { passId: comparison.id, expectedSha256: originalHash })
  assert.equal(archiveInputs.at(-1).folder.path, '/Drafts', 'Use the audited folder, not the initial inventory snapshot')
  assert.equal(archiveInputs.at(-1).direction, 'outgoing')
  assert.equal(items[0].status, 'verifying')
  await worker.stepLuxorMailImport()
  assert.equal(items[0].status, 'verified')
  await worker.stepLuxorMailImport()
  assert.equal(run.status, 'review')
  assert.equal((await worker.getLuxorMailImportStatus()).run.readyForCutover, false)
  console.log('PASS explicit changed-version action, audited snapshot/hash propagation, bounded verification and review gate')

  let authenticated = true
  let actions = 0
  const route = load('src/app/api/portal/mail-import/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => authenticated ? { email: 'owner@example.invalid' } : null },
    '@/lib/luxorMailReleaseServer': {},
    '@/lib/luxorMailImportServer': Object.fromEntries(['archiveLuxorMailSourceChanges','controlLuxorMailImport','getLuxorMailImportStatus','startLuxorMailImport','startLuxorMailSourceComparison','startLuxorMailSourceContent','stepLuxorMailImport']
      .map(name => [name, async () => { actions++; return { ok: true } }])),
  })
  const post = (body, origin = 'https://example.invalid', contentType = 'application/json') => route.POST(new Request('https://example.invalid/api/portal/mail-import', {
    method: 'POST', headers: { origin, 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
  authenticated = false
  assert.equal((await route.GET()).status, 401); assert.equal((await post({ action: 'step' })).status, 401)
  authenticated = true
  assert.equal((await post({ action: 'step' }, 'https://attacker.invalid')).status, 403)
  assert.equal((await post({ action: 'step' }, '')).status, 403)
  assert.equal((await post({ action: 'step' }, undefined, 'text/plain')).status, 415)
  assert.equal((await post('[')).status, 400)
  assert.equal((await post('null')).status, 400)
  assert.equal((await post({ action: 'delete' })).status, 400)
  assert.equal((await post({ action: 'start' })).status, 400)
  assert.equal((await post(' '.repeat(1025))).status, 413)
  assert.equal(actions, 0)
  assert.equal((await post({ action: 'start', confirm: 'archive-zoho-history' })).status, 200)
  assert.equal((await post({ action: 'step' })).status, 200)
  assert.equal((await post({ action: 'compare_source' })).status, 200)
  assert.equal((await post({ action: 'check_source_content' })).status, 200)
  assert.equal((await post({ action: 'archive_changes' })).status, 200)
  assert.match((await route.GET()).headers.get('cache-control'), /no-store/)
  console.log('PASS portal authorization, same-origin mutations, explicit start confirmation, bounded JSON and private cache headers')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
