'use client'

import { useId, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ClipboardList, FolderOpen, History, LayoutDashboard, Menu, ReceiptText, UserRound } from 'lucide-react'
import { PortalAnimatedTabs, PortalModal } from '@/components/portal/PortalUI'

type LeadWorkspaceNavProps = {
  activeTab: string
  onTabChange: (tab: string) => void
  counts: { activity: number; tasks: number; proposals: number; documents: number }
}

const GROUPS = [
  { id: 'overview', label: 'Overview', description: 'Current stage and next step', icon: LayoutDashboard, tabs: [{ id: 'overview', label: 'Overview' }] },
  { id: 'activity', label: 'Activity', description: 'History, texts, calls, and notes', icon: History, tabs: [{ id: 'activity', label: 'History' }, { id: 'messages', label: 'Text conversation' }, { id: 'notes', label: 'Notes' }, { id: 'delivery', label: 'Email delivery' }] },
  { id: 'tasks', label: 'Tasks', description: 'Follow-ups and reminders', icon: ClipboardList, tabs: [{ id: 'tasks', label: 'Tasks' }] },
  { id: 'booking', label: 'Booking', description: 'Proposals, agreement, and payments', icon: ReceiptText, tabs: [{ id: 'proposals', label: 'Proposals' }, { id: 'contract', label: 'Agreement' }, { id: 'payments', label: 'Payments' }] },
  { id: 'planning', label: 'Planning', description: 'Event plan, vendors, and run of show', icon: CalendarDays, tabs: [{ id: 'planning', label: 'Event plan' }, { id: 'vendors', label: 'Vendors' }, { id: 'timeline', label: 'Run of show' }] },
  { id: 'details', label: 'Details', description: 'Contact, event, and original inquiry', icon: UserRound, tabs: [{ id: 'details', label: 'Details' }] },
  { id: 'documents', label: 'Files', description: 'Documents and signed copies', icon: FolderOpen, tabs: [{ id: 'documents', label: 'Files' }] },
] as const

export function LeadWorkspaceNav({ activeTab, onTabChange, counts }: LeadWorkspaceNavProps) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const layoutId = useId()
  const viewsId = `${layoutId}-views`
  const activeGroup = GROUPS.find((group) => group.tabs.some((tab) => tab.id === activeTab)) || GROUPS[0]
  const activeView = activeGroup.tabs.find((tab) => tab.id === activeTab)
  const countFor = (id: string) => id === 'activity' ? counts.activity : id === 'tasks' ? counts.tasks : id === 'documents' ? counts.documents : undefined
  const chooseGroup = (id: string) => {
    const group = GROUPS.find((item) => item.id === id)
    if (group) onTabChange(group.tabs[0].id)
    if (id !== activeGroup.id) setExpandedGroup(null)
    setChooserOpen(false)
  }

  return <div className="min-w-0">
    <button type="button" onClick={() => setChooserOpen(true)} aria-haspopup="dialog" aria-expanded={chooserOpen} className="flex min-h-14 w-full items-center gap-3 bg-[color:var(--portal-card)] px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 md:hidden">
      <Menu size={17} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Browse views</span><span className="mt-0.5 block truncate text-sm font-semibold text-[color:var(--portal-text)]">{activeGroup.label}{activeGroup.tabs.length > 1 && activeView ? <span className="font-normal text-[color:var(--portal-muted)]"> · {activeView.label}</span> : null}</span></span>
      <ChevronDown size={16} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
    </button>

    <div className="hidden min-w-0 items-center bg-[color:var(--portal-soft)] md:flex">
      <div className="portal-scrollbar min-w-0 flex-1 overflow-x-auto">
      <PortalAnimatedTabs<string> ariaLabel="Lead workspace views" tabs={GROUPS.map((group) => ({ id: group.id, label: group.label, count: countFor(group.id) }))} activeTab={activeGroup.id} onTabChange={chooseGroup} className="!rounded-none !border-0 !bg-transparent" buttonClassName="!min-h-10" />
      </div>
      {activeGroup.tabs.length > 1 ? <button type="button" aria-expanded={expandedGroup === activeGroup.id} aria-controls={viewsId} onClick={() => setExpandedGroup((current) => current === activeGroup.id ? null : activeGroup.id)} className="mr-2 hidden min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 lg:inline-flex">{expandedGroup === activeGroup.id ? 'Hide views' : 'Show views'}<ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${expandedGroup === activeGroup.id ? 'rotate-180' : ''}`} /></button> : null}
    </div>

    {activeGroup.tabs.length > 1 ? <div id={viewsId} className={`min-w-0 lg:grid motion-reduce:!transition-none ${expandedGroup === activeGroup.id ? 'lg:visible lg:grid-rows-[1fr] lg:opacity-100 lg:[transition:grid-template-rows_0.28s_cubic-bezier(0.22,1,0.36,1),opacity_0.22s,visibility_0s]' : 'lg:invisible lg:grid-rows-[0fr] lg:opacity-0 lg:[transition:grid-template-rows_0.28s_cubic-bezier(0.22,1,0.36,1),opacity_0.22s,visibility_0s_linear_0.28s]'}`}>
      <div className="min-w-0 lg:min-h-0 lg:overflow-hidden">
      <div className="portal-scrollbar min-w-0 overflow-x-auto border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
      <PortalAnimatedTabs<string> ariaLabel={`${activeGroup.label} views`} tabs={activeGroup.tabs.map((tab) => ({ id: tab.id, label: tab.label, count: tab.id === 'proposals' ? counts.proposals : undefined }))} activeTab={activeTab} onTabChange={onTabChange} className="!rounded-none !border-0 !bg-transparent" buttonClassName="!min-h-10" />
      </div>
      </div>
    </div> : null}

    <PortalModal isOpen={chooserOpen} onClose={() => setChooserOpen(false)} title="Lead workspace" maxWidth="max-w-md">
      <nav aria-label="Choose a lead workspace view" className="space-y-1">
        {GROUPS.map((group) => {
          const Icon = group.icon
          const selected = activeGroup.id === group.id
          const count = countFor(group.id)
          return <button key={group.id} type="button" aria-pressed={selected} onClick={() => chooseGroup(group.id)} className={`flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${selected ? 'bg-[#caa24c]/10' : 'hover:bg-[color:var(--portal-soft)]'}`}>
            <Icon size={18} aria-hidden="true" className="shrink-0 text-[#a8792f]" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[color:var(--portal-text)]">{group.label}</span><span className="mt-0.5 block text-xs leading-5 text-[color:var(--portal-muted)]">{group.description}</span></span>
            {typeof count === 'number' ? <span className="rounded-full bg-[color:var(--portal-soft)] px-2 py-0.5 text-xs tabular-nums text-[color:var(--portal-muted)]">{count}</span> : null}
            {selected ? <Check size={15} aria-hidden="true" className="shrink-0 text-[#a8792f]" /> : null}
          </button>
        })}
      </nav>
    </PortalModal>
  </div>
}
