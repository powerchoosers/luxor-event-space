'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowUpRight, FlaskConical, Mail, Send, FileText, Wrench } from 'lucide-react'
import { EmailQueueHealthWidget } from '@/components/portal/EmailQueueHealthWidget'
import { PortalAnimatedTabs, PortalPageFrame, PortalPageHeader, PortalTabTransition } from '@/components/portal/PortalUI'
import { EMAIL_TEMPLATES } from '@/app/(portal)/portal/marketing/emailTemplates'
import type { LuxorMarketingTemplate } from '@/lib/luxorInquiryTypes'
import type { LuxorMailboxPageResult } from '@/lib/luxorMailboxPage'
import type { EmailMessageItem } from '@/app/(portal)/portal/marketing/tabs/AllEmailsTab'

type ToolsTab = 'queue' | 'templates' | 'activity' | 'test-tools'
type TestLeadSummary = {
  available?: boolean
  lead: { id: string; full_name: string; is_test?: boolean } | null
  settings: { enabled: boolean; email_recipient: string | null } | null
  runs?: Array<{ id: string; status: string; started_at: string }>
}

const tabs = [
  { id: 'queue', label: 'Queue', icon: <Send size={14} /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={14} /> },
  { id: 'activity', label: 'Activity', icon: <Activity size={14} /> },
  { id: 'test-tools', label: 'Test Tools', icon: <FlaskConical size={14} /> },
] as const

function isToolsTab(value: string | null): value is ToolsTab {
  return value === 'queue' || value === 'templates' || value === 'activity' || value === 'test-tools'
}

export function EmailToolsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab: ToolsTab = isToolsTab(requestedTab) ? requestedTab : 'queue'

  return (
    <EmailToolsContent
      activeTab={activeTab}
      onTabChange={(tab) => router.push(tab === 'queue' ? '/portal/email-tools' : `/portal/email-tools?tab=${encodeURIComponent(tab)}`, { scroll: false })}
    />
  )
}

function EmailToolsContent({ activeTab, onTabChange }: { activeTab: ToolsTab; onTabChange: (tab: ToolsTab) => void }) {
  return (
    <PortalPageFrame className="h-full min-h-0 flex-1 overflow-clip">
      <PortalPageHeader icon={<Wrench size={18} />} title="Email Tools" description="Queue health, saved templates, recent mailbox activity, and the isolated test workflow." />
      <div className="shrink-0 overflow-x-auto portal-scrollbar">
        <PortalAnimatedTabs tabs={tabs} activeTab={activeTab} onTabChange={(tab) => onTabChange(tab as ToolsTab)} ariaLabel="Email tools" />
      </div>
      <PortalTabTransition activeKey={activeTab} className="min-h-0 flex-1 overflow-y-auto portal-scrollbar pb-4">
        {activeTab === 'queue' ? <EmailQueueHealthWidget /> : null}
        {activeTab === 'templates' ? <TemplatesPanel /> : null}
        {activeTab === 'activity' ? <ActivityPanel /> : null}
        {activeTab === 'test-tools' ? <TestToolsPanel /> : null}
      </PortalTabTransition>
    </PortalPageFrame>
  )
}

function TemplatesPanel() {
  const [savedTemplates, setSavedTemplates] = useState<LuxorMarketingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/marketing/templates', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { templates?: LuxorMarketingTemplate[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Saved templates could not be loaded.')
      setSavedTemplates(Array.isArray(payload.templates) ? payload.templates : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Saved templates could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openComposer = (templateId: string) => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { templateId } }))

  if (loading) return <PanelMessage title="Loading templates" detail="Checking the saved Luxor templates." loading />
  if (error) return <PanelMessage title="Templates unavailable" detail={error} actionLabel="Retry" onAction={() => void load()} />

  return (
    <section aria-labelledby="saved-email-templates-title" className="space-y-6">
      <div>
        <h2 id="saved-email-templates-title" className="text-base font-semibold text-[color:var(--portal-text)]">Saved templates</h2>
        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Choose a template to open it in the existing email composer.</p>
      </div>
      {savedTemplates.length ? <div className="grid gap-3 lg:grid-cols-2">
        {savedTemplates.map((template) => <TemplateCard key={template.id} title={template.name} subject={template.subject} detail={template.description || template.category}
          onOpen={() => openComposer(`custom:${template.id}`)} />)}
      </div> : <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-4 text-sm text-[color:var(--portal-muted)]">No saved email templates are available.</p>}
      <div className="border-t border-[color:var(--portal-border)] pt-5">
        <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Starter templates</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {EMAIL_TEMPLATES.map((template) => <TemplateCard key={template.id} title={template.name} subject={template.name} detail={template.description || 'Built-in Luxor email starter'}
            onOpen={() => openComposer(`built-in:${template.id}`)} />)}
        </div>
      </div>
    </section>
  )
}

function TemplateCard({ title, subject, detail, onOpen }: { title: string; subject: string; detail: string; onOpen: () => void }) {
  return (
    <article className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
      <div className="min-w-0">
        <h4 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{title}</h4>
        <p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{detail}</p>
        {subject ? <p className="mt-1 truncate text-[11px] text-[color:var(--portal-faint)]">Subject: {subject}</p> : null}
      </div>
      <button type="button" onClick={onOpen} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[#caa24c]/35 px-3 text-xs font-semibold text-[#8c6529] transition-colors hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] dark:text-[#f1d27a]">
        <Mail size={14} /> Compose
      </button>
    </article>
  )
}

function ActivityPanel() {
  const [messages, setMessages] = useState<EmailMessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/email/mailbox', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'all', query: '', page: 1, pageSize: 12, snapshot: null, starred: [] }),
      })
      const payload = await response.json().catch(() => ({})) as LuxorMailboxPageResult<EmailMessageItem> & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Recent email activity could not be loaded.')
      setMessages(Array.isArray(payload.messages) ? payload.messages : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recent email activity could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <PanelMessage title="Loading email activity" detail="Loading the latest saved mailbox messages." loading />
  if (error) return <PanelMessage title="Email activity unavailable" detail={error} actionLabel="Retry" onAction={() => void load()} />

  return (
    <section aria-labelledby="email-activity-title" className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5">
        <div><h2 id="email-activity-title" className="text-base font-semibold text-[color:var(--portal-text)]">Recent email activity</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Latest messages saved to the Luxor mailbox.</p></div>
        <Link href="/portal/emails" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#8c6529] hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] dark:text-[#f1d27a]">Open inbox <ArrowUpRight size={14} /></Link>
      </div>
      {messages.length ? <ul className="divide-y divide-[color:var(--portal-border)]">
        {messages.map((message) => <li key={message.id}>
          {message.id.startsWith('event-') ? <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-[color:var(--portal-text)]">{message.subject || '(No subject)'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">Message details are unavailable for this notification.</span></span>
            <time className="shrink-0 text-[10px] tabular-nums text-[color:var(--portal-muted)]">{message.receivedAt ? new Date(message.receivedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No date'}</time>
          </div> : <Link href={`/portal/emails?messageId=${encodeURIComponent(message.id)}`} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[color:var(--portal-soft)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c] sm:px-5">
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-[color:var(--portal-text)]">{message.subject || '(No subject)'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{message.direction === 'outgoing' ? `To ${message.to}` : message.from}</span></span>
            <time className="shrink-0 text-[10px] tabular-nums text-[color:var(--portal-muted)]">{message.receivedAt ? new Date(message.receivedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No date'}</time>
          </Link>}
        </li>)}
      </ul> : <p className="p-6 text-sm text-[color:var(--portal-muted)]">No saved email activity is available.</p>}
    </section>
  )
}

function TestToolsPanel() {
  const [data, setData] = useState<TestLeadSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restricted, setRestricted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(''); setRestricted(false)
    try {
      const response = await fetch('/api/portal/test-lead?page=1', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as TestLeadSummary & { error?: string }
      if (response.status === 401 || response.status === 403) { setRestricted(true); return }
      if (!response.ok) throw new Error(payload.error || 'Isolated test tools could not be loaded.')
      setData(payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Isolated test tools could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <PanelMessage title="Checking isolated test tools" detail="Looking up the existing Test Lead workflow." loading />
  if (restricted) return <PanelMessage title="Test tools are restricted" detail="The existing Test Lead workflow is available to portal owners and admins." />
  if (error) return <PanelMessage title="Test tools unavailable" detail={error} actionLabel="Retry" onAction={() => void load()} />
  if (!data?.lead?.is_test) return <PanelMessage title="Test Lead unavailable" detail="The existing isolated Test Lead is not available right now." />

  const activeRun = data.runs?.find((run) => run.status === 'in_progress')

  return (
    <section className="max-w-3xl space-y-4" aria-labelledby="test-tools-title">
      <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-[#caa24c]/12 p-2 text-[#8c6529] dark:text-[#f1d27a]"><FlaskConical size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="test-tools-title" className="text-base font-semibold text-[color:var(--portal-text)]">Existing isolated Test Lead</h2>
            <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{data.lead.full_name} · {activeRun ? 'A test run is active' : 'No test run is active'}</p>
            <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Open the existing Test Lead record to use its workflow-safe email preview and test actions. This screen only reads test status; it does not queue or send email.</p>
            <Link href={`/portal/leads/${encodeURIComponent(data.lead.id)}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#b88d3c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#caa24c]">Open Test Lead <ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function PanelMessage({ title, detail, actionLabel, onAction, loading = false }: { title: string; detail: string; actionLabel?: string; onAction?: () => void; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm" role={loading ? 'status' : 'group'}>
      <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{detail}</p>
      {actionLabel && onAction ? <button type="button" onClick={onAction} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">{actionLabel}</button> : null}
    </div>
  )
}
