'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Loader2, Pause, Play, RefreshCw } from 'lucide-react'
import { PortalButton, PortalCheckbox, PortalModal } from '@/components/portal/PortalUI'
import type { LuxorMailReleaseReview } from '@/lib/luxorMailReleaseServer'

type MigrationRun = {
  id: string; mailbox: string; status: 'active' | 'paused' | 'review'
  phase: 'inventory' | 'archive' | 'reconcile'; folderCount: number; folderIndex: number
  currentFolder: string | null; stream: 'read' | 'unread'; pageStart: number
  counts: { total: number; pending: number; verifying: number; verified: number; failed: number; sourceConflicts: number }
  busy: boolean; nextAttemptAt: string; lastError: string | null; updatedAt: string
  releaseReview?: LuxorMailReleaseReview | null
  reconciliation: {
    generation: number; status: 'scanning' | 'finalizing' | 'complete'; folderCount: number; folderIndex: number
    currentFolder: string | null; stream: 'read' | 'unread'; pageStart: number; completedAt: string | null
    report: { observed: number; added: number; missing: number; moved: number; changed: number; repeated: number
      comparedWith: 'initial_inventory' | 'previous_pass'; foldersChangedDuringScan: boolean
      foldersChangedSincePrevious: boolean; matchesPrevious: boolean } | null
    content: { status: 'not_started' | 'checking' | 'complete'; completedAt: string | null
      counts: { total: number; pending: number; matching: number; different: number; versioned?: number; unarchived: number; unavailable: number } | null }
  } | null
}
type Snapshot = { run: MigrationRun | null }
type Action = 'start' | 'step' | 'pause' | 'resume' | 'retry_failed' | 'compare_source' | 'check_source_content' | 'archive_changes' | 'release_history'
const endpoint = '/api/portal/mail-import'

async function request(action?: Action, signal?: AbortSignal, release?: { passId: string; retainMissing: boolean }): Promise<Snapshot | { worked?: boolean }> {
  const response = await fetch(endpoint, {
    method: action ? 'POST' : 'GET', cache: 'no-store', signal,
    headers: { Accept: 'application/json', ...(action ? { 'Content-Type': 'application/json' } : {}) },
    ...(action ? { body: JSON.stringify({ action, ...(action === 'start' ? { confirm: 'archive-zoho-history' } : {}),
      ...(action === 'release_history' ? { ...release, confirm: 'release-verified-history' } : {}) }) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Could not load migration progress. Refresh to try again.')
  if (action !== 'step' && !Object.hasOwn(payload, 'run')) throw new Error('Migration progress is unavailable. Refresh to try again.')
  return payload
}

export function MailMigrationSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [releaseToConfirm, setReleaseToConfirm] = useState<LuxorMailReleaseReview | null>(null)
  const [retainMissing, setRetainMissing] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [pausing, setPausing] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const stop = useRef(true)
  const active = useRef(false)
  const revision = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++revision.current
    const result = await request(undefined, controller.current?.signal) as Snapshot
    if (!controller.current?.signal.aborted && current === revision.current) setSnapshot(result)
    return result
  }, [])

  useEffect(() => {
    const connection = new AbortController()
    controller.current = connection
    void refresh().catch((cause) => {
      if (!connection.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load migration status.')
    }).finally(() => { if (!connection.signal.aborted) setLoading(false) })
    return () => { stop.current = true; connection.abort() }
  }, [refresh])

  async function refreshStatus() {
    setLoading(true); setError(''); setNotice('')
    try { await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh migration status.') }
    finally { setLoading(false) }
  }

  // Only this explicit interaction starts work. Mounting, refreshing, theme
  // changes, and returning to Settings never start a migration automatically.
  async function runImport(action?: 'start' | 'resume' | 'retry_failed' | 'compare_source' | 'check_source_content' | 'archive_changes') {
    if (active.current) return
    active.current = true; stop.current = false
    setProcessing(true); setError(''); setNotice(''); setConfirmOpen(false)
    try {
      if (action) await request(action, controller.current?.signal)
      while (!stop.current && !controller.current?.signal.aborted) {
        const latest = await refresh()
        if (stop.current) break
        if (!latest.run || latest.run.status !== 'active') break
        if (latest.run.busy) {
          setNotice('Another batch is finishing. Saved progress is safe; refresh before continuing.')
          break
        }
        if (Date.parse(latest.run.nextAttemptAt) > Date.now()) {
          setNotice('The import is waiting before retrying. Refresh after the retry time shown below, then continue.')
          break
        }
        const result = await request('step', controller.current?.signal) as { worked?: boolean }
        if (!result.worked) {
          await refresh()
          setNotice('This pass stopped at a saved checkpoint. Review its status before continuing.')
          break
        }
      }
    } catch (cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'The import stopped. Saved progress can be resumed.')
    } finally {
      active.current = false
      if (!controller.current?.signal.aborted) setProcessing(false)
    }
  }

  async function pauseImport() {
    stop.current = true; setPausing(true); setError('')
    try {
      await request('pause', controller.current?.signal)
      await refresh()
      setNotice('Import paused. A current request may finish saving its files; the processing lock can take up to five minutes to clear.')
    } catch (cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not pause the saved run. This page has stopped requesting work.')
    } finally { if (!controller.current?.signal.aborted) setPausing(false) }
  }

  async function releaseHistory() {
    if (active.current || !releaseToConfirm?.passId || (releaseToConfirm.retainedCount > 0 && !retainMissing)) return
    active.current = true; setProcessing(true); setError(''); setNotice('')
    try {
      await request('release_history', controller.current?.signal, { passId: releaseToConfirm.passId, retainMissing })
      setReleaseToConfirm(null)
      await refresh()
      setNotice('Reviewed history is now available in the mailbox. Email delivery, DNS, and sign-in are unchanged.')
    } catch (cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'History could not be released. Refresh its saved status.')
    } finally {
      active.current = false
      if (!controller.current?.signal.aborted) setProcessing(false)
    }
  }

  const run = snapshot?.run
  const releaseReview = run?.releaseReview
  const comparison = run?.reconciliation
  const comparingInventory = Boolean(comparison && comparison.status !== 'complete')
  const content = comparison?.content
  const checkingContent = content?.status === 'checking'
  const comparing = comparingInventory || checkingContent
  const report = comparison?.report
  const phase = run?.phase === 'inventory' ? 'Finding original messages'
    : run?.phase === 'archive' ? 'Archiving and verifying'
      : checkingContent ? 'Checking current Zoho message contents'
        : comparingInventory ? 'Comparing current Zoho history' : 'History review'
  const ready = Boolean(snapshot) && !loading && !processing && !pausing && !run?.busy && !error
  const retryTime = run?.nextAttemptAt && Date.parse(run.nextAttemptAt) > Date.now()
    ? new Date(run.nextAttemptAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null

  return (
    <section aria-labelledby="mail-migration-heading" className="min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6 xl:col-span-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h3 id="mail-migration-heading" className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Email migration</h3>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--portal-muted)]">Preserve your Zoho history before moving to Resend. These controls copy and verify mail; they never send messages, delete originals, or switch delivery.</p>
        </div>
        <PortalButton onClick={() => void refreshStatus()} disabled={loading || processing || pausing} className="w-full shrink-0 sm:w-auto" aria-label="Refresh migration status">
          <RefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Refresh status
        </PortalButton>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm leading-relaxed text-[color:var(--portal-text)]">{error}</p> : null}
      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {loading && !snapshot ? <p className="text-sm text-[color:var(--portal-muted)]">Checking saved progress…</p> : null}
        {snapshot && !run ? <>
          <p className="text-sm font-semibold text-[color:var(--portal-text)]">History import has not started</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--portal-muted)]">Your existing mailbox stays in place. Imported copies stay separate until the final migration review.</p>
        </> : null}
        {run ? <>
          <p className="text-sm font-semibold text-[color:var(--portal-text)]">{run.status === 'paused' ? 'Paused · ' : ''}{phase}</p>
          <p className="mt-1 break-all text-xs text-[color:var(--portal-muted)]">{run.mailbox}</p>
          {run.phase === 'inventory' ? <p className="mt-2 break-words text-xs text-[color:var(--portal-muted)]">Folder {Math.min(run.folderIndex + 1, run.folderCount)} of {run.folderCount}: {run.currentFolder} · {run.stream} messages, starting at {run.pageStart.toLocaleString()}</p> : null}
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-[color:var(--portal-border)] py-4 sm:grid-cols-4">
            {([['Found', run.counts.total], ['Verified', run.counts.verified], ['Waiting', run.counts.pending + run.counts.verifying], ['Failed', run.counts.failed]] as const).map(([label, count]) => (
              <div key={label}><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-[color:var(--portal-text)]">{count.toLocaleString()}</dd></div>
            ))}
          </dl>
          {run.counts.sourceConflicts > 0 ? <p className="mt-3 text-xs leading-relaxed text-[color:var(--portal-text)]">{run.counts.sourceConflicts.toLocaleString()} source changes need reconciliation. No original was overwritten.</p> : null}
          {comparison ? <div className="mt-4 text-xs leading-relaxed text-[color:var(--portal-muted)]">
            <p className="font-semibold text-[color:var(--portal-text)]">Source comparison · pass {comparison.generation}</p>
            {comparingInventory ? <p className="mt-1 break-words">{comparison.status === 'finalizing' ? 'Checking whether the folder list changed during this pass.'
              : `Folder ${Math.min(comparison.folderIndex + 1, comparison.folderCount)} of ${comparison.folderCount}: ${comparison.currentFolder} · ${comparison.stream} messages, starting at ${comparison.pageStart.toLocaleString()}`}</p> : null}
            {report ? <>
              <p className="mt-1">{report.observed.toLocaleString()} messages observed. Compared with {report.comparedWith === 'initial_inventory' ? 'the original inventory' : 'the previous source pass'}.</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                {([['Added', report.added], ['Missing', report.missing], ['Moved', report.moved], ['Changed', report.changed]] as const).map(([label, count]) => (
                  <div key={label}><dt>{label}</dt><dd className="font-semibold tabular-nums text-[color:var(--portal-text)]">{count.toLocaleString()}</dd></div>
                ))}
              </dl>
              <p className="mt-2">New messages join the archive queue; no saved copies are deleted. Changed includes folder and read-status changes, so counts can overlap.</p>
              {report.repeated > 0 ? <p className="mt-2">{report.repeated.toLocaleString()} {report.repeated === 1 ? 'message appeared' : 'messages appeared'} more than once while paging. Run another comparison after source activity settles.</p> : null}
              {report.foldersChangedDuringScan || report.foldersChangedSincePrevious ? <p className="mt-2">The folder list changed. Review folder mapping and run another comparison.</p> : null}
              <p className="mt-2">{report.matchesPrevious ? 'Two consecutive source inventories match. Inventory agreement alone does not verify contents or approve cutover.'
                : 'Source stability is not established. Another comparison is needed before migration review.'}</p>
              {comparison.completedAt ? <p className="mt-2">Last compared {new Date(comparison.completedAt).toLocaleString()}.</p> : null}
            </> : null}
          </div> : null}
          {content?.counts ? <div className="mt-4 border-t border-[color:var(--portal-border)] pt-4 text-xs leading-relaxed text-[color:var(--portal-muted)]">
            <p className="font-semibold text-[color:var(--portal-text)]">Message content check · {checkingContent ? 'in progress' : 'finished'}</p>
            <p className="mt-1">{(content.counts.total - content.counts.pending).toLocaleString()} of {content.counts.total.toLocaleString()} messages processed. Matching means the current original matches its verified archive checksum.</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
              {([['Matching', content.counts.matching], ['Different', content.counts.different], ['Not archived', content.counts.unarchived], ['Unavailable', content.counts.unavailable]] as const).map(([label, count]) => (
                <div key={label}><dt>{label}</dt><dd className="font-semibold tabular-nums text-[color:var(--portal-text)]">{count.toLocaleString()}</dd></div>
              ))}
            </dl>
            {content.counts.different || content.counts.unarchived || content.counts.unavailable ? <p className="mt-2">Some originals need review. Different content is not overwritten; unavailable means the source could not be read, not that it was deleted.</p> : null}
            {content.counts.different > 0 ? <p className="mt-2 font-semibold text-[color:var(--portal-text)]">{(content.counts.versioned ?? 0).toLocaleString()} of {content.counts.different.toLocaleString()} changed originals archived as separate verified versions. Earlier copies and this comparison remain preserved.</p> : null}
            <p className="mt-2">This check does not release the archive or switch delivery. To recheck results after corrections, run a fresh source comparison.</p>
            {content.completedAt ? <p className="mt-2">Content checked {new Date(content.completedAt).toLocaleString()}.</p> : null}
          </div> : null}
          {releaseReview ? <div className="mt-4 border-t border-[color:var(--portal-border)] pt-4 text-xs leading-relaxed text-[color:var(--portal-muted)]">
            <p className="font-semibold text-[color:var(--portal-text)]">Mailbox release</p>
            {releaseReview.releasedAt ? <p className="mt-1">This snapshot was released {new Date(releaseReview.releasedAt).toLocaleString()}. Delivery has not been switched.</p>
              : releaseReview.ready ? <p className="mt-1">{releaseReview.messageCount.toLocaleString()} verified messages are ready for your review. {releaseReview.retainedCount > 0 ? `${releaseReview.retainedCount.toLocaleString()} are no longer in the latest Zoho inventory and will be kept in Retained history.` : 'Folder placement and read/unread state come from the reviewed source snapshot.'}</p>
                : <p className="mt-1">{releaseReview.blockers.join(' ')}</p>}
          </div> : null}
          {run.lastError ? <p className="mt-3 text-xs leading-relaxed text-[color:var(--portal-muted)]">{run.lastError}</p> : null}
          {run.busy && !processing ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">A processing lock is still active. Refresh when the current request has finished.</p> : null}
          {retryTime ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Next retry available after {retryTime}.</p> : null}
        </> : null}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!run ? <PortalButton variant="primary" disabled={!ready} onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto"><Archive size={14} aria-hidden="true" /> Review history import</PortalButton> : null}
        {run && run.status !== 'review' ? <PortalButton variant="primary" disabled={!ready || Boolean(retryTime)} onClick={() => void runImport(run.status === 'paused' ? 'resume' : undefined)} className="w-full sm:w-auto">
          {processing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {processing ? 'Processing history…' : run.status === 'paused' ? 'Resume import' : 'Continue import'}
        </PortalButton> : null}
        {run?.status === 'active' ? <PortalButton onClick={() => void pauseImport()} disabled={pausing} className="w-full sm:w-auto"><Pause size={14} aria-hidden="true" /> {pausing ? 'Pausing…' : 'Pause import'}</PortalButton> : null}
        {run?.status === 'review' && run.phase === 'reconcile' ? <PortalButton variant="primary" disabled={!ready} onClick={() => void runImport('compare_source')} className="w-full sm:w-auto"><RefreshCw size={14} aria-hidden="true" /> Compare Zoho history</PortalButton> : null}
        {run?.status === 'review' && comparison?.status === 'complete' && content?.status === 'not_started' ? <PortalButton disabled={!ready} onClick={() => void runImport('check_source_content')} className="w-full sm:w-auto"><Archive size={14} aria-hidden="true" /> Check message contents</PortalButton> : null}
        {run?.status === 'review' && content?.status === 'complete' && content.counts && content.counts.different > (content.counts.versioned ?? 0) ? <PortalButton disabled={!ready || Boolean(report?.repeated)} onClick={() => void runImport('archive_changes')} className="w-full sm:w-auto"><Archive size={14} aria-hidden="true" /> Archive changed originals</PortalButton> : null}
        {run && run.counts.failed > 0 && run.status !== 'active' && !comparing ? <PortalButton disabled={!ready} onClick={() => void runImport('retry_failed')} className="w-full sm:w-auto"><RefreshCw size={14} aria-hidden="true" /> Retry failed items</PortalButton> : null}
        {releaseReview?.ready && !releaseReview.releasedAt ? <PortalButton disabled={!ready} onClick={() => { setReleaseToConfirm(releaseReview); setRetainMissing(false) }} className="w-full sm:w-auto">Review mailbox release</PortalButton> : null}
      </div>
      {notice ? <p role="status" className="mt-3 text-xs leading-relaxed text-[color:var(--portal-muted)]">{notice}</p> : null}
      <p className="mt-4 text-xs leading-relaxed text-[color:var(--portal-muted)]">Processing runs while this Settings tab stays open. Leaving stops further batches; saved progress remains. A verified archive still needs folder, calendar, and source reconciliation before cutover.</p>

      <PortalModal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Archive Zoho mail history?" description="Create a private copy before the Resend migration.">
        <div className="space-y-4 text-sm leading-relaxed text-[color:var(--portal-muted)]">
          <p>This reads the configured Luxor mailbox, inventories its folders, and copies original messages and attachments into private Luxor storage.</p>
          <p>Nothing is sent or deleted. Delivery and login stay unchanged. Imported copies will not enter the live inbox until reconciliation is complete.</p>
          <p>Keep Settings open while processing. You can pause and resume from saved progress.</p>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <PortalButton onClick={() => setConfirmOpen(false)}>Not now</PortalButton>
            <PortalButton variant="primary" onClick={() => void runImport('start')} disabled={processing}>Start history import</PortalButton>
          </div>
        </div>
      </PortalModal>
      <PortalModal isOpen={Boolean(releaseToConfirm)} onClose={() => { if (!processing) setReleaseToConfirm(null) }} title="Release reviewed mail history?" description="Make this verified snapshot available in the Luxor mailbox.">
        <div className="space-y-4 text-sm leading-relaxed text-[color:var(--portal-muted)]">
          <p>{releaseToConfirm?.messageCount.toLocaleString()} messages from source pass {releaseToConfirm?.generation}. {releaseToConfirm?.snapshotAt ? `Inventory checked ${new Date(releaseToConfirm.snapshotAt).toLocaleString()}.` : ''}</p>
          <p>New mail or changes made in Zoho after this snapshot may still need another comparison. This does not switch delivery, DNS, or sign-in, and nothing is sent or deleted.</p>
          {releaseToConfirm && releaseToConfirm.retainedCount > 0 ? <PortalCheckbox
            checked={retainMissing} onChange={setRetainMissing} disabled={processing}
            label={`Keep the ${releaseToConfirm.retainedCount.toLocaleString()} archived messages no longer found in Zoho in Retained history.`}
          /> : null}
          {error ? <p role="alert" className="text-[color:var(--portal-text)]">{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <PortalButton disabled={processing} onClick={() => setReleaseToConfirm(null)}>Not now</PortalButton>
            <PortalButton variant="primary" disabled={processing || !releaseToConfirm?.ready || (Boolean(releaseToConfirm?.retainedCount) && !retainMissing)} onClick={() => void releaseHistory()}>{processing ? 'Releasing history…' : 'Release verified history'}</PortalButton>
          </div>
        </div>
      </PortalModal>
    </section>
  )
}
