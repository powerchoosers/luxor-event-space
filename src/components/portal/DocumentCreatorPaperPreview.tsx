'use client'

import Image from 'next/image'
import { LUXOR_CREATED_DOCUMENT_TYPE_LABELS, type LuxorCreatedDocumentType } from '@/lib/luxorDocumentCreatorTypes'
import { LUXOR_VENUE_ADDRESS } from '@/lib/luxorVenue'
import { stripControlCharsFromHtml } from '@/lib/luxorDocumentCreatorSanitize'

type Props = {
  title: string
  documentType: LuxorCreatedDocumentType
  bodyHtml: string
  pageCount?: number
  className?: string
}

export function DocumentCreatorPaperPreview({ title, documentType, bodyHtml, pageCount = 1, className = '' }: Props) {
  const label = LUXOR_CREATED_DOCUMENT_TYPE_LABELS[documentType].toUpperCase()
  return (
    <article
      className={`flex min-h-0 max-w-full flex-col overflow-hidden rounded-sm shadow-[0_18px_50px_rgba(0,0,0,0.12)] ${className}`}
      style={{ backgroundColor: '#fffdfa', color: '#211c17' }}
      aria-label="Live document preview"
    >
      <header className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: '#211c17' }}>
        <Image
          src="/luxor-portal-mark-gold-tight.png"
          alt=""
          width={34}
          height={34}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-cormorant)] text-[15px] font-semibold tracking-[0.08em] text-[#ebe0c8]">
            LUXOR
          </p>
          <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-[#fbf7ef]">At Las Palmas Events</p>
        </div>
        <p className="shrink-0 text-[7px] font-bold uppercase tracking-[0.12em] text-[#ebe0c8]">{label}</p>
      </header>
      <div className="min-h-[320px] flex-1 overflow-y-auto px-6 py-5 portal-scrollbar">
        <h1 className="break-words font-[family-name:var(--font-cormorant)] text-2xl font-semibold text-[#211c17]">{title || 'Untitled document'}</h1>
        <div
          className="mt-4 max-w-full break-words font-[family-name:var(--font-manrope)] text-[13px] leading-relaxed text-[#211c17] [&_h1]:mb-2 [&_h1]:break-words [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:break-words [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:break-words [&_h3]:text-sm [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:break-words [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: stripControlCharsFromHtml(bodyHtml || '<p class="text-[#6f6457]">Paste or type agreement text. Nothing is rewritten.</p>') }}
        />
      </div>
      <footer
        className="flex items-center justify-between border-t px-6 py-3 text-[7.2px] text-[#6b6256]"
        style={{ borderColor: '#ebe0c8', backgroundColor: '#fffdfa' }}
      >
        <p className="min-w-0 pr-3">Luxor Event Space&nbsp;&nbsp;|&nbsp;&nbsp;{LUXOR_VENUE_ADDRESS}</p>
        <p className="tabular-nums shrink-0">
          1 / <span className="tabular-nums">{Math.max(1, pageCount)}</span>
        </p>
      </footer>
    </article>
  )
}