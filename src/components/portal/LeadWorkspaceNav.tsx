'use client'

import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, Check, ChevronDown, ClipboardList, FolderOpen, History, LayoutDashboard, Menu, ReceiptText, UserRound } from 'lucide-react'
import { PortalModal } from '@/components/portal/PortalUI'

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
  const layoutId = useId()
  const reduceMotion = useReducedMotion()
  const activeGroup = GROUPS.find((group) => group.tabs.some((tab) => tab.id === activeTab)) || GROUPS[0]
  const activeView = activeGroup.tabs.find((tab) => tab.id === activeTab)
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 34 }
  const countFor = (id: string) => id === 'activity' ? counts.activity : id === 'tasks' ? counts.tasks : id === 'documents' ? counts.documents : undefined
  const chooseGroup = (id: string) => {
    const group = GROUPS.find((item) => item.id === id)
    if (group) onTabChange(group.tabs[0].id)
    setChooserOpen(false)
  }

  return <div className="min-w-0">
    <button type="button" onClick={() => setChooserOpen(true)} aria-haspopup="dialog" aria-expanded={chooserOpen} className="flex min-h-14 w-full items-center gap-3 bg-[color:var(--portal-card)] px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 md:hidden">
      <Menu size={17} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Browse views</span><span className="mt-0.5 block truncate text-sm font-semibold text-[color:var(--portal-text)]">{activeGroup.label}{activeGroup.tabs.length > 1 && activeView ? <span className="font-normal text-[color:var(--portal-muted)]"> · {activeView.label}</span> : null}</span></span>
      <ChevronDown size={16} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
    </button>

    <div className="portal-scrollbar hidden min-w-0 overflow-x-auto md:block">
      <nav aria-label="Lead workspace views" className="flex min-w-max items-center gap-1 bg-[color:var(--portal-card)] p-1">
        {GROUPS.map((group) => {
          const selected = activeGroup.id === group.id
          const count = countFor(group.id)
          return <button key={group.id} type="button" aria-pressed={selected} onClick={() => chooseGroup(group.id)} className={`relative isolate inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${selected ? 'text-[#8c6424] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}>
            {selected ? <motion.span layoutId={`${layoutId}-group`} className="absolute inset-0 -z-10 rounded-lg bg-[#caa24c]/15" transition={transition} aria-hidden="true" /> : null}
            {group.label}{typeof count === 'number' ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${selected ? 'bg-[#caa24c]/15' : 'bg-[color:var(--portal-soft)]'}`}>{count}</span> : null}
          </button>
        })}
      </nav>
    </div>

    {activeGroup.tabs.length > 1 ? <div className="portal-scrollbar min-w-0 overflow-x-auto border-t border-[color:var(--portal-border)]">
      <nav aria-label={`${activeGroup.label} views`} className="flex min-w-max items-center gap-1 p-1">
        {activeGroup.tabs.map((tab) => {
          const selected = activeTab === tab.id
          return <button key={tab.id} type="button" aria-pressed={selected} onClick={() => onTabChange(tab.id)} className={`relative isolate inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${selected ? 'text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>
            {selected ? <motion.span layoutId={`${layoutId}-subview`} className="absolute inset-0 -z-10 rounded-lg bg-[color:var(--portal-soft)]" transition={transition} aria-hidden="true" /> : null}
            {tab.label}{tab.id === 'proposals' ? <span className="rounded-full bg-[color:var(--portal-card)] px-1.5 py-0.5 text-[10px] tabular-nums text-[color:var(--portal-muted)]">{counts.proposals}</span> : null}
          </button>
        })}
      </nav>
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
