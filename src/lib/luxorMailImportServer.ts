import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { supabaseRest } from './supabaseRestServer'
import { mailLocalId } from './luxorMailboxServer'
import { getLuxorMailReleaseReview } from './luxorMailReleaseServer'
import { importLuxorZohoMessage, verifyLuxorZohoArchive } from './luxorZohoImportServer'
import { getLuxorZohoImportAccount, getLuxorZohoOriginalMessage, verifyLuxorZohoImportAccount, listLuxorZohoImportFolders, listLuxorZohoImportPage,
  normalizeEmailAddress, type LuxorZohoImportFolder, type LuxorZohoImportMessage } from './zohoMailServer'

type ImportRun = {
  id: string; account_id: string; mailbox: string; status: 'active' | 'paused' | 'review'
  phase: 'inventory' | 'archive' | 'reconcile'; folders: LuxorZohoImportFolder[]
  folder_index: number; stream: 'read' | 'unread'; page_start: number
  lease_token: string | null; lease_until: string | null; failures: number
  next_attempt_at: string; last_error: string | null; created_at: string; updated_at: string
}
type ImportItem = {
  id: string; run_id: string; source_message_id: string; folder: LuxorZohoImportFolder
  message: LuxorZohoImportMessage; status: 'pending' | 'verifying' | 'verified' | 'failed'
  local_message_id: string | null; failures: number; source_conflict: boolean
  target_pass_id: string | null; target_sha256: string | null
}
type Counts = { total: number; pending: number; verifying: number; verified: number; failed: number; sourceConflicts: number }
type SourcePass = {
  id: string; generation: number; status: 'scanning' | 'finalizing' | 'complete'; folders: LuxorZohoImportFolder[]
  folder_index: number; stream: 'read' | 'unread'; page_start: number; started_at: string; completed_at: string | null
  content_status: 'not_started' | 'checking' | 'complete'; content_started_at: string | null; content_completed_at: string | null
  report: { observed: number; added: number; missing: number; moved: number; changed: number; repeated: number
    comparedWith: 'initial_inventory' | 'previous_pass'; foldersChangedDuringScan: boolean
    foldersChangedSincePrevious: boolean; matchesPrevious: boolean } | null
}
type ContentCounts = { total: number; pending: number; matching: number; different: number; versioned: number; unarchived: number; unavailable: number; nextAttemptAt: string | null }
type ContentItem = { sourceMessageId: string; archive: { id: string | null; sha256: string | null } }

const LEASE_MS = 5 * 60_000
const MAX_FAILURES = 5
const retryAt = (failures: number) => new Date(Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 5))).toISOString()
const now = () => new Date().toISOString()

// Every operation is bounded independently. No background promise or in-memory
// progress survives a serverless invocation; all work is in the private ledger.
function db<T>(path: string, init: RequestInit = {}) {
  return supabaseRest<T>(path, { ...init, signal: AbortSignal.timeout(20_000) })
}

async function currentRun() {
  const account = getLuxorZohoImportAccount()
  const rows = await db<ImportRun[]>(`luxor_mail_import_runs?select=*&account_id=eq.${account.accountId}&limit=1`)
  const run = rows[0] || null
  if (run && run.mailbox !== account.mailbox) throw new Error('Import mailbox changed. Review the saved run before continuing.')
  return { account, run }
}

async function counts(id: string) {
  const result = await db<Counts>('rpc/luxor_mail_import_counts', { method: 'POST', body: JSON.stringify({ p_run_id: id }) })
  if (!result || !Number.isSafeInteger(result.total)) throw new Error('Import progress is unavailable.')
  return result
}

async function sourcePass(id: string) {
  const rows = await db<SourcePass[]>(`luxor_mail_source_passes?select=*&run_id=eq.${id}&order=generation.desc&limit=1`)
  return rows[0] || null
}

async function contentCounts(id: string) {
  return db<ContentCounts>('rpc/luxor_mail_source_content_counts', { method: 'POST', body: JSON.stringify({ p_pass_id: id }) })
}

/** Owner-safe summary: no provider account IDs, email bodies, or credentials. */
export async function getLuxorMailImportStatus() {
  const { run } = await currentRun()
  if (!run) return { run: null }
  const [progress, comparison, releaseReview] = await Promise.all([counts(run.id), sourcePass(run.id), getLuxorMailReleaseReview(run.id)])
  return { run: {
    id: run.id, mailbox: run.mailbox, status: run.status, phase: run.phase,
    folderCount: run.folders.length, folderIndex: run.folder_index,
    currentFolder: run.folders[run.folder_index]?.path || null,
    stream: run.stream, pageStart: run.page_start, counts: progress,
    busy: Boolean(run.lease_until && Date.parse(run.lease_until) > Date.now()),
    nextAttemptAt: run.next_attempt_at, lastError: run.last_error,
    createdAt: run.created_at, updatedAt: run.updated_at,
    reconciliation: comparison ? {
      generation: comparison.generation, status: comparison.status,
      folderCount: comparison.folders.length, folderIndex: comparison.folder_index,
      currentFolder: comparison.folders[comparison.folder_index]?.path || null,
      stream: comparison.stream, pageStart: comparison.page_start,
      startedAt: comparison.started_at, completedAt: comparison.completed_at, report: comparison.report,
      content: { status: comparison.content_status ?? 'not_started', startedAt: comparison.content_started_at,
        completedAt: comparison.content_completed_at,
        counts: comparison.content_status && comparison.content_status !== 'not_started' ? await contentCounts(comparison.id) : null },
    } : null,
    // A drained queue is NOT evidence that source paging was a consistent snapshot.
    readyForCutover: false,
    releaseReview,
  } }
}

/** Re-read originals only after the selected inventory and archive pass finish. */
export async function startLuxorMailSourceContent() {
  const { run } = await currentRun()
  if (!run || run.status !== 'review' || run.phase !== 'reconcile') throw new Error('Finish the archive and source inventory first.')
  const comparison = await sourcePass(run.id)
  if (!comparison || comparison.status !== 'complete' || comparison.content_status !== 'not_started') {
    throw new Error('Create a fresh source comparison before checking its message contents.')
  }
  await verifyLuxorZohoImportAccount()
  const committed = await db<boolean>('rpc/luxor_start_mail_source_content', { method: 'POST',
    body: JSON.stringify({ p_run_id: run.id, p_pass_id: comparison.id }) })
  if (!committed) throw new Error('The source content audit state changed. Refresh before continuing.')
  return getLuxorMailImportStatus()
}

/** A fresh comparison is explicit and never overwrites the original archive. */
export async function archiveLuxorMailSourceChanges() {
  const { run } = await currentRun()
  if (!run || run.status !== 'review' || run.phase !== 'reconcile') throw new Error('Finish the current import pass first.')
  const comparison = await sourcePass(run.id)
  if (!comparison || comparison.content_status !== 'complete') throw new Error('Check current message contents before archiving changes.')
  await verifyLuxorZohoImportAccount()
  const committed = await db<boolean>('rpc/luxor_archive_mail_source_changes', { method: 'POST',
    body: JSON.stringify({ p_run_id: run.id, p_pass_id: comparison.id }) })
  if (!committed) throw new Error('The source changes need a fresh comparison or archive review before proceeding.')
  return getLuxorMailImportStatus()
}

/** A fresh comparison is explicit and never overwrites the original archive. */
export async function startLuxorMailSourceComparison() {
  const { account, run } = await currentRun()
  if (!run || run.status !== 'review' || run.phase !== 'reconcile') throw new Error('Finish or resume the current archive pass first.')
  const previous = await sourcePass(run.id)
  await verifyLuxorZohoImportAccount()
  const folders = await listLuxorZohoImportFolders(account.accountId)
  const committed = await db<boolean>('rpc/luxor_start_mail_source_pass', { method: 'POST', body: JSON.stringify({
    p_run_id: run.id, p_expected_generation: previous?.generation ?? 0, p_folders: folders,
  }) })
  if (!committed) throw new Error('The source comparison state changed. Refresh before continuing.')
  return getLuxorMailImportStatus()
}

/** Explicit owner action; does not fetch message bodies or activate a cron. */
export async function startLuxorMailImport(startedBy: string) {
  const { account, run } = await currentRun()
  if (run) return getLuxorMailImportStatus()
  await verifyLuxorZohoImportAccount()
  const folders = await listLuxorZohoImportFolders(account.accountId)
  if (!folders.length || new Set(folders.map((folder) => folder.id)).size !== folders.length) {
    throw new Error('A complete, non-duplicated Zoho folder inventory is required to start.')
  }
  await db('luxor_mail_import_runs?on_conflict=account_id', { method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({
      account_id: account.accountId, mailbox: account.mailbox, started_by: startedBy, folders,
    }) })
  return getLuxorMailImportStatus()
}

/** Pausing leaves a live lease intact: resume cannot overlap an in-flight step. */
export async function controlLuxorMailImport(action: 'pause' | 'resume' | 'retry_failed') {
  const { run } = await currentRun()
  if (!run) throw new Error('Start a history inventory first.')
  const committed = await db<boolean>('rpc/luxor_control_mail_import', { method: 'POST',
    body: JSON.stringify({ p_run_id: run.id, p_action: action }) })
  if (!committed) throw new Error('Import work may still be finishing or reconciliation needs a new comparison. Refresh its saved status.')
  return getLuxorMailImportStatus()
}

async function release(run: ImportRun, changes: Partial<ImportRun> = {}) {
  await db(`luxor_mail_import_runs?id=eq.${run.id}&lease_token=eq.${run.lease_token}&status=eq.active`, { method: 'PATCH',
    body: JSON.stringify({ lease_token: null, lease_until: null, updated_at: now(), ...changes }) })
}

async function commitItem(run: ImportRun, item: ImportItem, changes: {
  status: ImportItem['status']; localId: string | null; failures?: number; error?: string; verifiedAt?: string | null
}) {
  const committed = await db<boolean>('rpc/luxor_commit_mail_import_item', { method: 'POST', body: JSON.stringify({
    p_run_id: run.id, p_token: run.lease_token, p_item_id: item.id,
    p_status: changes.status, p_local_id: changes.localId, p_failures: changes.failures ?? 0,
    p_next_attempt: changes.failures ? retryAt(changes.failures) : now(),
    p_error: changes.error ?? null, p_verified_at: changes.verifiedAt ?? null,
  }) })
  if (!committed) throw new Error('Import step lost its lease. Its saved files are safe to resume.')
}

async function checkSourceContent(run: ImportRun, comparison: SourcePass) {
  const item = await db<ContentItem | null>('rpc/luxor_next_mail_source_content', { method: 'POST',
    body: JSON.stringify({ p_pass_id: comparison.id }) })
  if (!item) {
    const progress = await contentCounts(comparison.id)
    if (progress.pending) {
      await release(run, { next_attempt_at: progress.nextAttemptAt || now() })
      return { worked: false, retryPending: true }
    }
    const committed = await db<boolean>('rpc/luxor_finish_mail_source_content', { method: 'POST',
      body: JSON.stringify({ p_run_id: run.id, p_token: run.lease_token, p_pass_id: comparison.id }) })
    if (!committed) throw new Error('Content audit lost its processing lease.')
    return { worked: true, phase: 'reconcile' }
  }
  if (!/^\d+$/.test(item.sourceMessageId) || !item.archive
    || (item.archive.sha256 !== null && !/^[0-9a-f]{64}$/.test(item.archive.sha256))) {
    throw new Error('Invalid content comparison target.')
  }
  let hash: string | null = null
  let readFailed = false
  if (item.archive.sha256 !== null) {
    try {
      const raw = await getLuxorZohoOriginalMessage(run.account_id, item.sourceMessageId)
      hash = createHash('sha256').update(raw).digest('hex')
    } catch {
      // A failure is not a mismatch or proof of deletion. The ledger retries it
      // independently, then reports unavailable without discarding saved evidence.
      readFailed = true
    }
  }
  const committed = await db<boolean>('rpc/luxor_commit_mail_source_content', { method: 'POST', body: JSON.stringify({
    p_run_id: run.id, p_token: run.lease_token, p_pass_id: comparison.id, p_message_id: item.sourceMessageId,
    p_expected_archive: item.archive, p_source_sha256: hash, p_read_failed: readFailed,
  }) })
  if (!committed) throw new Error('The content audit lease or verified archive changed. Retry this item.')
  return { worked: true, phase: 'reconcile' }
}

/** One source page OR one stored MIME part per call. Never sends mail. */
export async function stepLuxorMailImport() {
  const { account, run: existing } = await currentRun()
  if (!existing) throw new Error('Start a history inventory first.')
  if (existing.status !== 'active') return { worked: false }
  const stamp = now()
  const claimed = await db<ImportRun[]>(`luxor_mail_import_runs?id=eq.${existing.id}&status=eq.active&next_attempt_at=lte.${encodeURIComponent(stamp)}&or=(lease_until.is.null,lease_until.lt.${encodeURIComponent(stamp)})&select=*`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      lease_token: randomUUID(), lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: stamp,
    }),
  })
  const run = claimed[0]
  if (!run) return { worked: false }
  try {
    if (run.phase === 'reconcile') {
      const comparison = await sourcePass(run.id)
      if (comparison?.status === 'complete' && comparison.content_status === 'checking') {
        return await checkSourceContent(run, comparison)
      }
      if (!comparison || comparison.status === 'complete') throw new Error('No active source comparison.')
      const args = { p_run_id: run.id, p_token: run.lease_token, p_pass_id: comparison.id }
      let committed: boolean
      if (comparison.status === 'finalizing') {
        // Re-read folders after paging to catch folders added/removed/renamed mid-scan.
        const folders = await listLuxorZohoImportFolders(run.account_id)
        committed = await db<boolean>('rpc/luxor_finish_mail_source_pass', { method: 'POST',
          body: JSON.stringify({ ...args, p_folders: folders }) })
      } else {
        const folder = comparison.folders[comparison.folder_index]
        if (!folder) throw new Error('Missing source comparison folder.')
        const page = await listLuxorZohoImportPage({ accountId: run.account_id, folderId: folder.id,
          start: comparison.page_start, status: comparison.stream, limit: 100 })
        committed = await db<boolean>('rpc/luxor_commit_mail_source_page', { method: 'POST',
          body: JSON.stringify({ ...args, p_messages: page.messages }) })
      }
      if (!committed) throw new Error('Source comparison lost its processing lease.')
      return { worked: true, phase: 'reconcile' }
    }
    if (run.phase === 'inventory') {
      const folder = run.folders[run.folder_index]
      if (!folder) throw new Error('Missing saved source folder.')
      const page = await listLuxorZohoImportPage({ accountId: run.account_id, folderId: folder.id,
        start: run.page_start, status: run.stream, limit: 100 })
      const committed = await db<boolean>('rpc/luxor_commit_mail_import_page', { method: 'POST',
        body: JSON.stringify({ p_run_id: run.id, p_token: run.lease_token, p_messages: page.messages }) })
      if (!committed) throw new Error('Inventory lease expired; repeat this page.')
      return { worked: true, phase: 'inventory' }
    }
    const items = await db<ImportItem[]>(`luxor_mail_import_items?select=*&run_id=eq.${run.id}&status=in.(pending,verifying)&next_attempt_at=lte.${encodeURIComponent(now())}&order=next_attempt_at.asc,id.asc&limit=1`)
    const item = items[0]
    if (!item) {
      const remaining = await counts(run.id)
      if (remaining.pending || remaining.verifying) await release(run)
      else await release(run, { status: 'review', phase: 'reconcile', last_error:
        'Archive pass finished. Reconcile the current Zoho source, folder mapping, failed items, and active appointments before cutover.' })
      return { worked: false }
    }
    try {
      if (item.status === 'pending') {
        let snapshot = { folder: item.folder, message: item.message }
        if (item.target_pass_id) {
          const observations = await db<Array<typeof snapshot>>(`luxor_mail_source_observations?select=folder,message&pass_id=eq.${item.target_pass_id}&source_message_id=eq.${item.source_message_id}&source_sha256=eq.${item.target_sha256}&check_status=eq.different&limit=1`)
          if (!observations[0] || !item.target_sha256) throw new Error('Source revision target is unavailable.')
          snapshot = observations[0]
        }
        const from = normalizeEmailAddress(String(snapshot.message.source.fromAddress || ''))
        const outgoing = ['Sent', 'Drafts', 'Outbox', 'Templates'].includes(snapshot.folder.type) || account.senders.includes(from)
        const result = await importLuxorZohoMessage({ accountId: run.account_id, ...snapshot,
          direction: outgoing ? 'outgoing' : 'incoming', maxParts: 1, staged: true,
          ...(item.target_pass_id ? { revision: { passId: item.target_pass_id, expectedSha256: item.target_sha256! } } : {}) })
        await commitItem(run, item, { status: result.complete ? 'verifying' : 'pending', localId: mailLocalId(result.id) })
      } else {
        if (!item.local_message_id) throw new Error('Archive item has no local message.')
        const result = await verifyLuxorZohoArchive(item.local_message_id, { maxParts: 1, resume: true })
        await commitItem(run, item, { status: result.complete ? 'verified' : 'verifying',
          localId: item.local_message_id, verifiedAt: result.verifiedAt })
      }
    } catch {
      const failures = item.failures + 1
      await commitItem(run, item, { status: failures >= MAX_FAILURES ? 'failed' : item.status,
        localId: item.local_message_id, failures,
        error: item.status === 'verifying' ? 'Archive integrity verification failed. Retain the Zoho original and retry or review this item.'
          : item.target_pass_id ? 'Source-version import failed. The original may have changed again. Retry a temporary failure, or finish this pass and run a fresh source comparison and content check.'
            : 'Original-message import failed. Check Zoho read authorization and private storage, then retry this item.' })
    }
    return { worked: true, phase: 'archive' }
  } catch {
    const failures = run.failures + 1
    // Do not expose raw provider/database errors, which can contain message data.
    // Do not overwrite a pause selected while this request was running.
    await db(`luxor_mail_import_runs?id=eq.${run.id}&lease_token=eq.${run.lease_token}&status=eq.active`, {
      method: 'PATCH', body: JSON.stringify({ lease_token: null, lease_until: null, failures,
        status: failures >= MAX_FAILURES ? 'paused' : 'active', next_attempt_at: retryAt(failures), updated_at: now(),
        last_error: 'Import step could not be committed. Progress is saved; check source authorization and database availability before retrying.' }),
    })
    return { worked: false, retryPending: true }
  }
}
