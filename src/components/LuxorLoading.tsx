import { LuxorAxisLockup } from '@/components/LuxorWordmark'

export function SiteLoading() {
  return (
    <main className="relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden bg-[#050505] px-6 pt-28 text-[#f7efe3]">
      <div className="absolute inset-0 luxor-noise opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(202,162,76,0.16),transparent_24rem)]" />
      <div className="relative w-full max-w-md text-center">
        <LuxorAxisLockup className="mx-auto w-full max-w-[300px]" />
        <div className="mx-auto mt-8 h-1 w-44 overflow-hidden rounded-full bg-[#caa24c]/12">
          <div className="luxor-loading-bar h-full w-1/2 rounded-full bg-[#caa24c]" />
        </div>
        <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#caa24c]">
          Preparing the experience
        </p>
      </div>
    </main>
  )
}

export function PortalLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center my-auto min-h-[calc(100vh-10rem)] w-full py-10 px-4">
      <div className="w-full max-w-md rounded-3xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#caa24c]">
          <span className="absolute inset-0 rounded-2xl bg-[#caa24c]/20 animate-ping opacity-30" />
          <span className="h-4 w-4 rounded-full bg-[#caa24c] shadow-[0_0_12px_rgba(202,162,76,0.8)]" />
        </div>
        <h2 className="mt-6 text-xl font-extrabold tracking-tight text-[color:var(--portal-text)]">
          Syncing Workspace
        </h2>
        <p className="mt-2 text-xs font-medium leading-relaxed text-[color:var(--portal-muted)]">
          Connecting client dossiers, venue telemetry, and operational schedules...
        </p>
        <div className="mt-7 space-y-3">
          <div className="luxor-skeleton h-3.5 w-full rounded-md" />
          <div className="luxor-skeleton h-3.5 w-4/5 mx-auto rounded-md" />
          <div className="luxor-skeleton h-3.5 w-3/5 mx-auto rounded-md" />
        </div>
      </div>
    </div>
  )
}
