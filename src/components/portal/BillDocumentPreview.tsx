'use client'

import { useState } from 'react'
import { PortalModal } from '@/components/portal/PortalUI'
import { PortalPdfViewer } from '@/components/portal/PortalPdfViewer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

export default function BillDocumentPreview({ bill }: { bill: LuxorBill }) {
  const [open, setOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageAttempt, setImageAttempt] = useState(0)
  if (!bill.source_message_id || !bill.source_attachment_id) return <p className="text-xs text-[color:var(--portal-muted)]">No source invoice is attached to this bill.</p>
  const url = `/api/operations/bills/${encodeURIComponent(bill.id)}/document`
  const isImage = bill.source_content_type?.startsWith('image/')
  const isPdf = bill.source_content_type === 'application/pdf' || /\.pdf$/i.test(bill.source_filename || '')
  return <>
    <button type="button" onClick={() => { setImageError(false); setImageAttempt((value) => value + 1); setOpen(true) }} className="inline-flex min-h-11 items-center text-left text-xs font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">View invoice</button>
    <PortalModal isOpen={open} onClose={() => setOpen(false)} title={bill.source_filename || 'Invoice'} maxWidth="max-w-5xl" fullScreenOnMobile>
      {open ? isPdf ? <div className="flex h-[calc(100dvh-8rem)] min-h-0 flex-col sm:h-[65dvh]"><PortalPdfViewer url={url} title={bill.source_filename || 'Invoice'} /></div> : isImage ? imageError ? <div role="alert" className="space-y-3 text-sm text-[color:var(--portal-text)]"><p>The invoice image could not be loaded.</p><button type="button" onClick={() => { setImageError(false); setImageAttempt((value) => value + 1) }} className="min-h-11 font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">Try again</button></div> : <div className="flex max-h-[65dvh] justify-center overflow-auto bg-[color:var(--portal-soft)] p-3"><img src={`${url}?preview=${imageAttempt}`} alt={`Invoice from ${bill.provider}`} className="max-w-full object-contain" onError={() => setImageError(true)} /></div> : <p className="text-sm text-[color:var(--portal-muted)]">A preview is unavailable for this file. <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">Open the original document</a></p> : null}
    </PortalModal>
  </>
}
