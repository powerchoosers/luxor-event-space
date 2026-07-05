import React from 'react'

export function PortalPageFrame({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-6 ${className}`}>{children}</div>
}

export function PortalPageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {icon ? <div className="rounded-lg border border-[#caa24c]/24 bg-[#caa24c]/10 p-2 text-[#caa24c] shadow-[0_0_20px_rgba(202,162,76,0.14)]">{icon}</div> : null}
          <h1 className="text-2xl font-bold tracking-tight text-white/90 sm:text-3xl">{title}</h1>
        </div>
        <p className="max-w-2xl text-sm font-medium leading-6 text-zinc-500">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function PortalTableCard({
  controls,
  children,
  footer,
  className = '',
}: {
  controls?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section className={`nodal-void-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#caa24c]/10 bg-black/40 shadow-2xl shadow-black/30 backdrop-blur-xl ${className}`}>
      {controls ? <div className="shrink-0 border-b border-[#caa24c]/10 bg-white/[0.02] p-4 sm:p-6">{controls}</div> : null}
      <div className="portal-scrollbar min-h-[22rem] flex-1 overflow-auto" data-portal-table-scroller>
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-[#caa24c]/10 bg-[#0c0c0c] p-4 sm:p-6">{footer}</div> : null}
    </section>
  )
}

export function PortalStickyTable({
  children,
  minWidth = '960px',
}: {
  children: React.ReactNode
  minWidth?: string
}) {
  return (
    <table className="w-full text-left" style={{ minWidth }}>
      {children}
    </table>
  )
}

export function PortalStickyThead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-20 border-b border-[#caa24c]/10 bg-[#0c0c0c] shadow-[0_1px_0_rgba(202,162,76,0.12)]">
      {children}
    </thead>
  )
}

export function PortalBridgeCard({
  label,
  title,
  description,
  action,
}: {
  label: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-[#caa24c]/18 bg-[#120d0c]/72 p-5 shadow-2xl shadow-black/25">
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#caa24c]/10 blur-3xl" />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">{label}</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  )
}

export function PortalEmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-zinc-900 bg-zinc-950/40">
      {icon ? <div className="mb-4 text-zinc-700">{icon}</div> : null}
      <h3 className="text-base font-bold text-white/90">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function PortalStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    contacted: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    tour_requested: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    tour_confirmed: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    proposal_sent: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    booked: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    closed_lost: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20',
    draft: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
    sent: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    paid: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    overdue: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]',
    cancelled: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20',
  }

  const formatStatus = (s: string) => {
    return s
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const normalized = status.toLowerCase().replace(/\s+/g, '_')
  const badgeStyle = styles[normalized] ?? 'bg-zinc-500/10 text-zinc-300 border border-zinc-500/20'

  return (
    <span className={`inline-flex items-center rounded-sm px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${badgeStyle}`}>
      {formatStatus(status)}
    </span>
  )
}

export function PortalTimeline({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative border-l border-zinc-900 pl-6 space-y-6">
      {children}
    </div>
  )
}

export function PortalTimelineItem({
  title,
  time,
  icon,
  children,
  badge,
}: {
  title: string
  time: string
  icon?: React.ReactNode
  children?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="relative">
      <div className="absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-zinc-800 bg-[#080706] text-zinc-500 shadow-sm">
        {icon ?? <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />}
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-xs font-bold text-white/90 uppercase tracking-widest">{title}</h4>
          <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
          {badge ? <div className="ml-auto">{badge}</div> : null}
        </div>
        {children ? <div className="mt-2 text-xs leading-relaxed text-zinc-400">{children}</div> : null}
      </div>
    </div>
  )
}

export function PortalModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-900 bg-[#080706] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-900 bg-white/[0.02] px-6 py-4">
          <h3 className="text-sm font-bold text-white/90 uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white transition-all">
            <span className="text-xs font-bold">Close</span>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function PortalDetailSection({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-900/50 pb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

