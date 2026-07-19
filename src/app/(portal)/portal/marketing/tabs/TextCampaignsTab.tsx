'use client'

import { Database, MessageSquare } from 'lucide-react'

export function TextCampaignsTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {['Campaigns', 'Texts Sent', 'Replies', 'Opt-outs'].map((label) => (
          <div key={label} className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-zinc-500">{label}</p>
            <p className="mt-3 font-mono text-xl font-bold text-zinc-500">—</p>
            <p className="mt-2 text-[8.5px] leading-4 text-zinc-650">No campaign dataset connected</p>
          </div>
        ))}
      </div>

      <div className="flex min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-zinc-850 bg-zinc-950/20 p-8 text-center">
        <div className="max-w-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-[#caa24c]">
            <MessageSquare size={20} />
          </div>
          <h3 className="mt-5 text-base font-bold text-white">No Supabase-backed SMS campaigns</h3>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            Luxor can send individual text messages, but this page does not yet have a real campaign-and-recipient dataset. It will stay empty instead of showing sample promotions, made-up delivery totals, or pretend bookings.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-850 bg-black/20 px-4 py-2 text-[10px] font-bold text-zinc-500">
            <Database size={13} /> Campaign reporting has not been connected
          </div>
        </div>
      </div>
    </div>
  )
}
