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
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-[#caa24c]/10 bg-black/40 p-8 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/10">
          <span className="h-5 w-5 animate-pulse rounded-full bg-[#caa24c]" />
        </div>
        <h2 className="mt-5 text-lg font-bold tracking-tight text-white">Loading workspace</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Syncing client records, tasks, and venue signals.</p>
        <div className="mt-6 grid gap-3">
          <div className="luxor-skeleton h-4 rounded" />
          <div className="luxor-skeleton h-4 w-4/5 rounded" />
          <div className="luxor-skeleton h-4 w-2/3 rounded" />
        </div>
      </div>
    </div>
  )
}
