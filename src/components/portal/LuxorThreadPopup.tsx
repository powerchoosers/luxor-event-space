'use client'

import { motion } from 'framer-motion'
import { ExternalLink, MessageSquare, X } from 'lucide-react'
import Link from 'next/link'
import { LuxorTextThread } from './LuxorTextThread'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'

export function LuxorThreadPopup({ inquiryId, phone, contactName, onClose }: { inquiryId: string; phone: string; contactName: string; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <motion.div initial={{ opacity: 0, y: 80, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 70, scale: 0.98 }} transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }} className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#caa24c]/20 bg-[#090908] shadow-[0_30px_100px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4">
        <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-black text-white"><MessageSquare size={15} className="text-[#caa24c]"/> {contactName}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{formatPhoneDisplay(phone)}</p></div>
        <div className="flex items-center gap-2"><Link href={`/portal/messages?inquiryId=${encodeURIComponent(inquiryId)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#caa24c]/25 px-3 text-[9px] font-black uppercase tracking-wider text-[#f1d27a] hover:bg-[#caa24c]/8"><ExternalLink size={13}/> Full Messenger</Link><button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Close text conversation"><X size={16}/></button></div>
      </div>
      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-4"><LuxorTextThread inquiryId={inquiryId} phone={phone} contactName={contactName}/></div>
    </motion.div>
  </motion.div>
}
