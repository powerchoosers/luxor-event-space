'use client'

import Image from 'next/image'
import React, { useMemo, useState } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Eye, Grid2X2, List, Loader2, MoreHorizontal, Search, Send, Trash2, X } from 'lucide-react'
import { PortalSelect, PortalStatusBadge } from '@/components/portal/PortalUI'
import type { Campaign } from '../page'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { useToast } from '@/components/portal/ToastProvider'
import { PortalBulkActionDeck, PortalBulkConfirmDialog, PortalBulkHeaderSelector, PortalBulkRowSelector, usePortalBulkSelection } from '@/components/portal/PortalBulkSelection'

interface EmailCampaignsTabProps {
  campaigns: Campaign[]
  loading: boolean
  error: string | null
  busyId: string | null
  detailLoadingId: string | null
  onReport: (id: string) => void
  onCancel: (id: string) => void
  onSendNow: (id: string) => void
  onChanged: () => Promise<void> | void
}

type CampaignFilter = 'all' | 'sent' | 'scheduled' | 'draft' | 'automations'
type CampaignSort = 'newest' | 'oldest' | 'performance' | 'name'
type CampaignView = 'grid' | 'list'

const GRID_PAGE_SIZE = 8
const LIST_PAGE_SIZE = 10
const FALLBACK_IMAGES = [
  '/images/dining-hall/main-hall-wedding-wide.png',
  '/images/dining-hall/main-hall-quinceanera-angle.png',
  '/images/luxor-lounge/luxor-lounge-wedding.png',
  '/images/dining-hall/main-hall-corporate-cocktail.png',
]

export function EmailCampaignsTab({ campaigns, loading, error, busyId, detailLoadingId, onReport, onCancel, onSendNow, onChanged }: EmailCampaignsTabProps) {
  const { notify } = useToast()
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [sort, setSort] = useState<CampaignSort>('newest')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<CampaignView>('grid')
  const [page, setPage] = useState(1)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const stats = useMemo(() => {
    const recipients = campaigns.reduce((sum, campaign) => sum + Number(campaign.recipient_count || 0), 0)
    const sent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent_count || 0), 0)
    const uniqueOpens = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_opens || 0), 0)
    const uniqueClicks = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_clicks || 0), 0)
    return [
      { label: 'Recipients reached', value: recipients.toLocaleString(), detail: 'Across all campaigns' },
      { label: 'Average open rate', value: `${sent ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0}%`, detail: `${uniqueOpens.toLocaleString()} unique opens` },
      { label: 'Average click rate', value: `${sent ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0}%`, detail: `${uniqueClicks.toLocaleString()} unique clicks` },
    ]
  }, [campaigns])

  const filterCounts = useMemo(() => ({
    all: campaigns.length,
    sent: campaigns.filter((campaign) => campaign.status === 'sent').length,
    scheduled: campaigns.filter((campaign) => campaign.status === 'scheduled').length,
    draft: campaigns.filter((campaign) => campaign.status === 'draft').length,
    automations: campaigns.filter((campaign) => campaign.audience_label?.toLowerCase().includes('automat')).length,
  }), [campaigns])

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = campaigns.filter((campaign) => {
      const matchesFilter = filter === 'all' ? true : filter === 'automations' ? campaign.audience_label?.toLowerCase().includes('automat') ?? false : campaign.status === filter
      if (!matchesFilter) return false
      if (!normalizedQuery) return true
      return [campaign.name, campaign.subject, campaign.audience_label].filter(Boolean).some((value) => decodeHtmlEntities(String(value)).toLowerCase().includes(normalizedQuery))
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return decodeHtmlEntities(a.name).localeCompare(decodeHtmlEntities(b.name))
      if (sort === 'performance') return (b.open_rate + b.click_rate) - (a.open_rate + a.click_rate)
      const aTime = new Date(a.sent_at || a.scheduled_for || a.created_at).getTime()
      const bTime = new Date(b.sent_at || b.scheduled_for || b.created_at).getTime()
      return sort === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [campaigns, filter, query, sort])

  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : LIST_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(filteredCampaigns.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageCampaigns = filteredCampaigns.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const matchingCampaignIds = useMemo(() => filteredCampaigns.map((campaign) => campaign.id), [filteredCampaigns])
  const visibleCampaignIds = useMemo(() => pageCampaigns.map((campaign) => campaign.id), [pageCampaigns])
  const bulkSelectedCount = bulkSelection.selectedCount(matchingCampaignIds.length)

  async function runCampaignBulkAction(action: 'cancel' | 'delete') {
    const ids = bulkSelection.resolveIds(matchingCampaignIds)
    if (!ids.length) return
    setBulkBusy(action)
    try {
      let affected = 0
      let warning: string | undefined
      if (action === 'cancel') {
        for (const id of ids) {
          const response = await fetch(`/api/marketing/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) })
          const payload = await response.json().catch(() => ({})) as { error?: string }
          if (!response.ok) throw new Error(payload.error || 'Unable to cancel campaigns.')
          affected += 1
        }
      } else {
        const response = await fetch('/api/portal/bulk-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'marketing_campaigns', action: 'delete', ids }) })
        const payload = await response.json().catch(() => ({})) as { error?: string; warning?: string; affected?: number }
        if (!response.ok) throw new Error(payload.error || 'Unable to delete campaigns.')
        affected = payload.affected || 0
        warning = payload.warning
      }
      bulkSelection.clear()
      setConfirmBulkDelete(false)
      await onChanged()
      notify({ title: action === 'delete' ? 'Campaigns deleted' : 'Campaigns cancelled', description: warning || `${affected} campaign${affected === 1 ? '' : 's'} changed.`, variant: warning ? 'info' : 'success' })
    } catch (bulkError) {
      notify({ title: 'Bulk action failed', description: bulkError instanceof Error ? bulkError.message : 'Unable to update campaigns.', variant: 'error' })
    } finally {
      setBulkBusy(null)
    }
  }

  return (
    <div className="space-y-7 pb-8">
      <section aria-label="Campaign performance" className="grid border-y border-[color:var(--portal-border)] md:grid-cols-3">
        {stats.map((stat, index) => (
          <div key={stat.label} className={`flex min-h-24 items-center px-5 py-5 ${index ? 'border-t border-[color:var(--portal-border)] md:border-l md:border-t-0' : ''}`}>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{stat.label}</p>
              {loading ? <div className="mt-2 h-6 w-20 rounded luxor-skeleton" /> : <p className="mt-1.5 font-mono text-xl font-semibold text-[color:var(--portal-text)]">{stat.value}</p>}
              <p className="mt-1 text-[10px] text-[color:var(--portal-faint)]">{stat.detail}</p>
            </div>
          </div>
        ))}
      </section>

      {error ? <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-400"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">Campaign data could not load.</p><p className="mt-1 text-xs opacity-80">{error}</p></div></div> : null}

      <section aria-labelledby="campaign-library-heading" className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 id="campaign-library-heading" className="font-serif text-2xl font-semibold text-[color:var(--portal-text)]">Your campaigns</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Browse drafts, upcoming sends, and campaign performance.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 sm:w-64"><span className="sr-only">Search campaigns</span><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search campaigns" className="h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-9 pr-3 text-xs text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10" /></label>
            <PortalSelect value={sort} onChange={(value) => { setSort(value as CampaignSort); setPage(1) }} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'performance', label: 'Best performance' }, { value: 'name', label: 'Campaign name' }]} className="sm:w-44" buttonClassName="h-10" />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Campaign status">
            {([['all', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['sent', 'Sent'], ['automations', 'Automations']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => { setFilter(value); setPage(1) }} className={`relative shrink-0 pb-3 text-[11px] font-bold transition-colors ${filter === value ? 'text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>{label} <span className="ml-1 font-mono text-[9px] text-[color:var(--portal-faint)]">{filterCounts[value]}</span>{filter === value ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#caa24c]" /> : null}</button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            {visibleCampaignIds.length ? <div className="flex items-center gap-2 text-[10px] font-semibold text-[color:var(--portal-muted)]"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(visibleCampaignIds)} onChange={() => bulkSelection.selectPage(visibleCampaignIds)} /><span>Select page</span></div> : null}
            <div className="flex rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1" aria-label="Campaign view"><ViewButton active={view === 'grid'} onClick={() => { setView('grid'); setPage(1) }} label="Grid view"><Grid2X2 size={14} /></ViewButton><ViewButton active={view === 'list'} onClick={() => { setView('list'); setPage(1) }} label="List view"><List size={15} /></ViewButton></div>
          </div>
        </div>

        {loading ? <CampaignSkeleton view={view} /> : !pageCampaigns.length ? (
          <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-6 py-16 text-center"><p className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">{campaigns.length ? 'No campaigns found' : 'Your campaign library is ready'}</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[color:var(--portal-muted)]">{campaigns.length ? 'Try another status or search term.' : 'Create your first campaign to start building a visual history of every send.'}</p></div>
        ) : view === 'grid' ? (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-4">{pageCampaigns.map((campaign, index) => <CampaignCard key={campaign.id} {...campaignItemProps(campaign, (currentPage - 1) * pageSize + index, bulkSelection.isSelected(campaign.id), openMenuId === campaign.id, busyId === campaign.id, detailLoadingId === campaign.id, () => bulkSelection.toggle(campaign.id), () => setOpenMenuId((current) => current === campaign.id ? null : campaign.id), () => setOpenMenuId(null), () => onReport(campaign.id), () => onSendNow(campaign.id), () => onCancel(campaign.id))} />)}</div>
        ) : (
          <div className="divide-y divide-[color:var(--portal-border)] border-y border-[color:var(--portal-border)]">{pageCampaigns.map((campaign, index) => <CampaignRow key={campaign.id} {...campaignItemProps(campaign, (currentPage - 1) * pageSize + index, bulkSelection.isSelected(campaign.id), openMenuId === campaign.id, busyId === campaign.id, detailLoadingId === campaign.id, () => bulkSelection.toggle(campaign.id), () => setOpenMenuId((current) => current === campaign.id ? null : campaign.id), () => setOpenMenuId(null), () => onReport(campaign.id), () => onSendNow(campaign.id), () => onCancel(campaign.id))} />)}</div>
        )}

        {!loading && filteredCampaigns.length ? <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] pt-4"><p className="text-[10px] text-[color:var(--portal-muted)]">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredCampaigns.length)} of {filteredCampaigns.length}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition hover:text-[color:var(--portal-text)] disabled:opacity-35" aria-label="Previous campaign page"><ChevronLeft size={15} /></button><span className="min-w-16 text-center font-mono text-[10px] text-[color:var(--portal-muted)]">{currentPage} / {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition hover:text-[color:var(--portal-text)] disabled:opacity-35" aria-label="Next campaign page"><ChevronRight size={15} /></button></div></div> : null}
      </section>

      <PortalBulkActionDeck selectedCount={bulkSelectedCount} pageCount={visibleCampaignIds.length} totalCount={matchingCampaignIds.length} allMatching={bulkSelection.allMatching} busyAction={bulkBusy} noun="campaign" onSelectAll={bulkSelection.selectAllMatching} onClear={bulkSelection.clear} onAction={(action) => { if (action === 'cancel') void runCampaignBulkAction('cancel'); if (action === 'delete') setConfirmBulkDelete(true) }} actions={[{ id: 'cancel', label: 'Cancel', icon: <X size={13} /> }, { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' }]} />
      <PortalBulkConfirmDialog open={confirmBulkDelete} title={`Delete ${bulkSelectedCount} selected campaign${bulkSelectedCount === 1 ? '' : 's'}?`} description="This permanently removes eligible campaigns and their recipient and engagement reports. Campaigns that are actively sending are protected and will be kept." confirmLabel="Delete eligible campaigns" busy={bulkBusy === 'delete'} onClose={() => setConfirmBulkDelete(false)} onConfirm={() => void runCampaignBulkAction('delete')} />
    </div>
  )
}

type CampaignItemProps = { campaign: Campaign; index: number; selected: boolean; menuOpen: boolean; busy: boolean; reportBusy: boolean; onToggleSelected: () => void; onToggleMenu: () => void; onCloseMenu: () => void; onReport: () => void; onSendNow: () => void; onCancel: () => void }

function campaignItemProps(campaign: Campaign, index: number, selected: boolean, menuOpen: boolean, busy: boolean, reportBusy: boolean, onToggleSelected: () => void, onToggleMenu: () => void, onCloseMenu: () => void, onReport: () => void, onSendNow: () => void, onCancel: () => void): CampaignItemProps {
  return { campaign, index, selected, menuOpen, busy, reportBusy, onToggleSelected, onToggleMenu, onCloseMenu, onReport, onSendNow, onCancel }
}

function CampaignCard({ campaign, index, selected, menuOpen, busy, reportBusy, onToggleSelected, onToggleMenu, onCloseMenu, onReport, onSendNow, onCancel }: CampaignItemProps) {
  return <article className="group min-w-0"><div className={`relative aspect-[4/5] overflow-hidden rounded-xl border bg-[color:var(--portal-card)] transition duration-200 ${selected ? 'border-[#caa24c] ring-2 ring-[#caa24c]/15' : 'border-[color:var(--portal-border)] group-hover:border-[#caa24c]/35'}`}><CampaignPreview campaign={campaign} index={index} /><button type="button" onClick={onReport} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]" aria-label={`Open report for ${decodeHtmlEntities(campaign.name)}`} /><div className="absolute left-3 top-3 z-20 rounded-md bg-[color:var(--portal-card)]/95 p-1 shadow-sm backdrop-blur-sm"><PortalBulkRowSelector checked={selected} index={index + 1} onChange={onToggleSelected} label={decodeHtmlEntities(campaign.name)} /></div><div className="absolute right-3 top-3 z-30"><CampaignMenu campaign={campaign} open={menuOpen} busy={busy} reportBusy={reportBusy} onToggle={onToggleMenu} onClose={onCloseMenu} onReport={onReport} onSendNow={onSendNow} onCancel={onCancel} /></div></div><div className="pt-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{decodeHtmlEntities(campaign.name)}</h3><p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{decodeHtmlEntities(campaign.subject) || 'Subject not set'}</p></div><PortalStatusBadge status={campaign.status} /></div><p className="mt-2 text-[10px] text-[color:var(--portal-faint)]">{formatCampaignDate(campaign)}</p><div className="mt-3 grid grid-cols-3 gap-3 border-t border-[color:var(--portal-border)] pt-3"><CampaignMetric label="Recipients" value={campaign.recipient_count.toLocaleString()} /><CampaignMetric label="Opens" value={campaign.sent_count ? `${campaign.open_rate}%` : '—'} /><CampaignMetric label="Clicks" value={campaign.sent_count ? `${campaign.click_rate}%` : '—'} /></div></div></article>
}

function CampaignRow({ campaign, index, selected, menuOpen, busy, reportBusy, onToggleSelected, onToggleMenu, onCloseMenu, onReport, onSendNow, onCancel }: CampaignItemProps) {
  return <article className={`grid gap-4 px-3 py-4 transition hover:bg-[color:var(--portal-soft)] sm:grid-cols-[auto_68px_minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[auto_68px_minmax(220px,1fr)_110px_110px_90px_90px_auto] ${selected ? 'bg-[#caa24c]/5' : ''}`}><PortalBulkRowSelector checked={selected} index={index + 1} onChange={onToggleSelected} label={decodeHtmlEntities(campaign.name)} /><button type="button" onClick={onReport} className="relative hidden h-20 overflow-hidden rounded-md border border-[color:var(--portal-border)] sm:block" aria-label={`Open report for ${decodeHtmlEntities(campaign.name)}`}><CampaignPreview campaign={campaign} index={index} compact /></button><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{decodeHtmlEntities(campaign.name)}</h3><p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{decodeHtmlEntities(campaign.subject) || 'Subject not set'}</p><p className="mt-1 truncate text-[9px] text-[color:var(--portal-faint)]">{campaign.audience_label || 'Audience not labeled'}</p></div><div className="hidden lg:block"><PortalStatusBadge status={campaign.status} /></div><p className="hidden text-[10px] leading-4 text-[color:var(--portal-muted)] lg:block">{formatCampaignDate(campaign)}</p><CampaignMetric className="hidden lg:block" label="Recipients" value={campaign.recipient_count.toLocaleString()} /><CampaignMetric className="hidden lg:block" label="Open rate" value={campaign.sent_count ? `${campaign.open_rate}%` : '—'} /><div className="justify-self-end"><CampaignMenu campaign={campaign} open={menuOpen} busy={busy} reportBusy={reportBusy} onToggle={onToggleMenu} onClose={onCloseMenu} onReport={onReport} onSendNow={onSendNow} onCancel={onCancel} /></div></article>
}

function CampaignPreview({ campaign, index, compact = false }: { campaign: Campaign; index: number; compact?: boolean }) {
  const html = campaign.html_body?.trim()
  if (html) return <iframe title={`Email preview: ${decodeHtmlEntities(campaign.name)}`} srcDoc={createSafePreviewDocument(html, compact ? 0.115 : 0.5)} sandbox="" loading="lazy" tabIndex={-1} aria-hidden="true" className="pointer-events-none h-full w-full border-0 bg-white" />
  return <Image src={FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]} alt="" fill sizes={compact ? '68px' : '(min-width: 1280px) 260px, (min-width: 640px) 42vw, 90vw'} className="object-cover" />
}

function CampaignMenu({ campaign, open, busy, reportBusy, onToggle, onClose, onReport, onSendNow, onCancel }: { campaign: Campaign; open: boolean; busy: boolean; reportBusy: boolean; onToggle: () => void; onClose: () => void; onReport: () => void; onSendNow: () => void; onCancel: () => void }) {
  const canManageQueue = campaign.queued_count > 0
  return <div className="relative">{open ? <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={onClose} aria-label="Close campaign actions" /> : null}<button type="button" onClick={onToggle} className="relative z-40 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] shadow-sm transition hover:text-[color:var(--portal-text)]" aria-label={`Actions for ${decodeHtmlEntities(campaign.name)}`} aria-expanded={open}><MoreHorizontal size={16} /></button>{open ? <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-xl"><MenuAction icon={reportBusy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} label="View report" onClick={() => { onClose(); onReport() }} disabled={reportBusy} />{canManageQueue ? <MenuAction icon={<Send size={13} />} label="Send now" onClick={() => { onClose(); onSendNow() }} disabled={busy} /> : null}{canManageQueue ? <MenuAction icon={<X size={13} />} label="Cancel send" onClick={() => { onClose(); onCancel() }} disabled={busy} tone="danger" /> : null}</div> : null}</div>
}

function MenuAction({ icon, label, onClick, disabled, tone = 'default' }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: 'default' | 'danger' }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10px] font-semibold transition disabled:opacity-40 ${tone === 'danger' ? 'text-rose-400 hover:bg-rose-500/10' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}>{icon}{label}</button>
}

function CampaignMetric({ label, value, className = '' }: { label: string; value: string; className?: string }) { return <div className={className}><p className="font-mono text-xs font-semibold text-[color:var(--portal-text)]">{value}</p><p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-[color:var(--portal-faint)]">{label}</p></div> }
function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${active ? 'bg-[#caa24c]/12 text-[#caa24c]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>{children}</button> }

function CampaignSkeleton({ view }: { view: CampaignView }) {
  if (view === 'list') return <div className="space-y-px">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 border-y border-[color:var(--portal-border)] luxor-skeleton" />)}</div>
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index}><div className="aspect-[4/5] rounded-xl luxor-skeleton" /><div className="mt-3 h-4 w-3/4 rounded luxor-skeleton" /><div className="mt-2 h-3 w-1/2 rounded luxor-skeleton" /></div>)}</div>
}

function createSafePreviewDocument(html: string, scale: number) {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '').replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '').replace(/<img\b[^>]*(?:\/api\/marketing\/track|tracking[_-]?pixel)[^>]*>/gi, '')
  const previewHead = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:;"><style>html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:hidden!important}body{min-width:600px!important;transform:scale(${scale});transform-origin:top left}a{pointer-events:none!important}</style>`
  return /<head[\s>]/i.test(withoutScripts) ? withoutScripts.replace(/<head([^>]*)>/i, `<head$1>${previewHead}`) : `<!doctype html><html><head>${previewHead}</head><body>${withoutScripts}</body></html>`
}

function formatCampaignDate(campaign: Campaign) {
  const value = campaign.sent_at || campaign.scheduled_for || campaign.created_at
  const label = campaign.sent_at ? 'Sent' : campaign.scheduled_for ? 'Scheduled' : 'Edited'
  return `${label} ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))}`
}
