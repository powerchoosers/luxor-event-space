'use client'

import { useEffect, useId, useState } from 'react'
import { Download, Eye, FileText, LoaderCircle, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import type { LuxorInvoice } from '@/lib/luxorInquiryTypes'
import { PortalCloseButton, PortalModal } from '@/components/portal/PortalUI'
import { PortalPdfViewer } from '@/components/portal/PortalPdfViewer'

type PreviewTab = 'email' | 'pdf'

type ProposalEmailPreview = {
  subject: string
  html: string
  recipient?: string | null
  attachmentFileName?: string | null
  snapshot?: 'draft' | 'published' | 'frozen'
  /** True only when the actual delivery HTML was stored at send time. */
  exact?: boolean
  deliveryState?: 'prepared' | 'delivered' | null
  deliverySentAt?: string | null
  error?: string
}

type ProposalDeliveryPreviewProps = {
  invoice: LuxorInvoice | null
  clientEmail?: string | null
  initialTab?: PreviewTab
  onClose: () => void
}

export function ProposalDeliveryPreview({
  invoice,
  clientEmail,
  initialTab = 'email',
  onClose,
}: ProposalDeliveryPreviewProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>(initialTab)
  const [emailPreview, setEmailPreview] = useState<ProposalEmailPreview | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const tabId = useId()

  const invoiceId = invoice?.id || null
  const isPublished = invoice?.status === 'sent'
  const isFrozen = isPublished && Boolean(invoice?.price_locked_at)
  const isLegacyPublished = isPublished && !isFrozen
  const hasExactEmailSnapshot = emailPreview?.exact === true
  const preparedDelivery = emailPreview?.deliveryState === 'prepared'
  const attachmentLabel = invoice
    ? isFrozen
      ? `Luxor-Final-Proposal-${invoice.id.slice(0, 8)}.pdf`
      : isLegacyPublished
        ? `Historical document ${invoice.id.slice(0, 8).toUpperCase()}`
        : `Luxor-Final-Proposal-${invoice.id.slice(0, 8)}.pdf`
    : null
  const pdfUrl = invoiceId ? `/api/invoices/${encodeURIComponent(invoiceId)}/pdf?disposition=inline` : ''
  const downloadUrl = invoiceId ? `/api/invoices/${encodeURIComponent(invoiceId)}/pdf` : ''

  const loadEmailPreview = async (signal?: AbortSignal) => {
    if (!invoiceId) return
    setLoadingEmail(true)
    setEmailError(null)
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/email-preview?mode=proposal`, {
        cache: 'no-store',
        signal,
      })
      const data = await response.json().catch(() => ({})) as ProposalEmailPreview
      if (!response.ok || !data.subject || !data.html) throw new Error(data.error || 'The email preview could not be prepared.')
      setEmailPreview(data)
    } catch (error) {
      if (signal?.aborted) return
      setEmailPreview(null)
      setEmailError(error instanceof Error ? error.message : 'The email preview could not be prepared.')
    } finally {
      if (!signal?.aborted) setLoadingEmail(false)
    }
  }

  useEffect(() => {
    if (!invoiceId) {
      setEmailPreview(null)
      setEmailError(null)
      setLoadingEmail(false)
      return
    }
    setActiveTab(initialTab)
    const controller = new AbortController()
    void loadEmailPreview(controller.signal)
    return () => controller.abort()
    // Reload only when the selected saved proposal changes. The function uses
    // that invoice id deliberately and must not loop when preview state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, initialTab])

  const changeTab = (nextTab: PreviewTab) => setActiveTab(nextTab)
  const handleTabKeys = (event: React.KeyboardEvent<HTMLButtonElement>, current: PreviewTab) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    changeTab(current === 'email' ? 'pdf' : 'email')
  }

  return (
    <PortalModal isOpen={Boolean(invoice)} onClose={onClose} ariaLabel="Client delivery preview" maxWidth="max-w-6xl">
      {invoice ? (
        <div className="flex h-[min(86vh,920px)] min-h-[580px] flex-col overflow-hidden bg-[color:var(--portal-bg)] text-[color:var(--portal-text)]">
          <header className="shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#f1d27a]">Client delivery preview</p>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.13em] ${isFrozen ? 'text-emerald-700 dark:text-emerald-300' : isPublished ? 'text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}>
                    <ShieldCheck size={12} /> {isFrozen ? 'Locked proposal version' : isPublished ? 'Published proposal version' : 'Saved draft version'}
                  </span>
                </div>
                <h3 className="mt-1 truncate font-serif text-xl font-semibold sm:text-2xl">Review the client&apos;s email and attached proposal.</h3>
                <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[color:var(--portal-muted)]">
                  {isFrozen && hasExactEmailSnapshot
                    ? 'These are the stored email and attached PDF delivered with this locked proposal version.'
                    : isFrozen && preparedDelivery
                    ? 'This locked proposal is ready to retry. Its private link and delivery payload are saved, but email delivery has not been confirmed yet.'
                    : isFrozen
                    ? 'The attached PDF is locked to this proposal version. This email is a faithful template preview because this older record did not retain its rendered email.'
                    : isLegacyPublished
                      ? 'This is a historical document from the prior workflow. It remains available for the audit trail, but it cannot be resent as a final proposal.'
                      : 'Nothing sends from this window. The draft email and PDF are generated from the saved proposal details shown here.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {downloadUrl ? <a href={downloadUrl} className="hidden min-h-9 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition hover:border-[#caa24c]/40 hover:text-[#8c6529] dark:hover:text-[#f1d27a] sm:inline-flex"><Download size={13} /> Download PDF</a> : null}
                <PortalCloseButton onClick={onClose} aria-label="Close client delivery preview" />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-[11px] text-[color:var(--portal-muted)]"><span className="mr-1 font-black uppercase tracking-[0.12em] text-[9px]">To</span>{' '}{emailPreview?.recipient || clientEmail || 'Client email required before publishing'}</p>
                <p className="truncate text-[10px] text-[color:var(--portal-muted)]"><span className="mr-1 font-black uppercase tracking-[0.12em] text-[8px]">Attachment</span>{' '}{emailPreview?.attachmentFileName || attachmentLabel}</p>
              </div>
              <div className="inline-flex w-fit rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1" role="tablist" aria-label="Client delivery formats">
                <button
                  id={`${tabId}-email-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'email'}
                  aria-controls={`${tabId}-email-panel`}
                  tabIndex={activeTab === 'email' ? 0 : -1}
                  onClick={() => changeTab('email')}
                  onKeyDown={(event) => handleTabKeys(event, 'email')}
                  className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'email' ? 'bg-[color:var(--portal-card)] text-[#8c6529] shadow-sm dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                >
                  <Mail size={13} /> Email
                </button>
                <button
                  id={`${tabId}-pdf-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'pdf'}
                  aria-controls={`${tabId}-pdf-panel`}
                  tabIndex={activeTab === 'pdf' ? 0 : -1}
                  onClick={() => changeTab('pdf')}
                  onKeyDown={(event) => handleTabKeys(event, 'pdf')}
                  className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'pdf' ? 'bg-[color:var(--portal-card)] text-[#8c6529] shadow-sm dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                >
                  <FileText size={13} /> Attached PDF
                </button>
              </div>
            </div>
          </header>

          {isLegacyPublished ? (
            <aside className="shrink-0 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 sm:px-6" role="note">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">Historical legacy document</p>
              <p className="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-100">This record predates the final-proposal workflow and may use former “estimate” wording. Keep it for history; create a revised final proposal before sending anything new to the client.</p>
            </aside>
          ) : null}

          {activeTab === 'email' ? (
            <section id={`${tabId}-email-panel`} role="tabpanel" aria-labelledby={`${tabId}-email-tab`} className="min-h-0 flex-1 overflow-auto bg-[color:var(--portal-soft)] p-3 sm:p-5">
              <div className="mx-auto max-w-[760px] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-white shadow-[0_14px_36px_rgba(31,25,18,0.12)]">
                <div className="flex items-start justify-between gap-4 border-b border-[#ddd6c9] bg-[#fbfaf7] px-4 py-3 text-[#241f19] sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8c6529]">Subject</p>
                    <p className="mt-1 truncate text-sm font-semibold">{loadingEmail ? 'Preparing client email…' : emailPreview?.subject || 'Email preview unavailable'}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#6d655b]"><Eye size={12} /> Preview only</span>
                </div>
                {loadingEmail ? (
                  <div className="flex min-h-[500px] items-center justify-center px-6 text-center text-sm text-[#6d655b]"><LoaderCircle className="mr-2 animate-spin text-[#8c6529]" size={18} /> Assembling the exact delivery email…</div>
                ) : emailError ? (
                  <div className="flex min-h-[500px] flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm font-bold text-rose-700">Email preview unavailable</p>
                    <p className="mt-2 max-w-md text-xs leading-5 text-[#6d655b]">{emailError}</p>
                    <button type="button" onClick={() => void loadEmailPreview()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#a8792f]/35 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] transition hover:bg-[#fbf8f2]"><RefreshCw size={13} /> Retry preview</button>
                  </div>
                ) : emailPreview ? (
                  <iframe title="Exact client proposal email preview" srcDoc={emailPreview.html} className="block h-[min(61vh,720px)] min-h-[520px] w-full bg-white" sandbox="" />
                ) : null}
              </div>
            </section>
          ) : (
            <section id={`${tabId}-pdf-panel`} role="tabpanel" aria-labelledby={`${tabId}-pdf-tab`} className="min-h-0 flex-1">
              <PortalPdfViewer url={pdfUrl} title={isFrozen ? 'final proposal attachment' : isLegacyPublished ? 'historical legacy attachment' : 'proposal draft attachment'} />
            </section>
          )}

          <footer className="flex shrink-0 items-center gap-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-2.5 text-[10px] leading-4 text-[color:var(--portal-muted)] sm:px-6">
            <ShieldCheck size={13} className="shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
            This proposal email contains no payment link. Stripe is sent only after the client signs the Event Agreement.
          </footer>
        </div>
      ) : null}
    </PortalModal>
  )
}
