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
