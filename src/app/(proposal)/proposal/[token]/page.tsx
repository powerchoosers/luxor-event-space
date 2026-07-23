import { Check, CreditCard, FileText, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getInvoiceByPublicToken, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'

export const dynamic = 'force-dynamic'

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function ClientProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled') notFound()

  const payments = await listPaidPaymentsByInvoice(invoice.id)
  const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
  const requestedAmount = Math.min(Number(invoice.payment_requested_amount || balanceDue), balanceDue)

  if (!invoice.proposal_viewed_at) {
    await updateInvoice(invoice.id, { proposal_viewed_at: new Date().toISOString() })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(202,162,76,0.16),transparent_35%),#050505] px-4 py-8 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-[#caa24c]/25 bg-[#0b0907] shadow-2xl shadow-black/50">
        <header className="border-b border-[#caa24c]/15 px-6 py-8 text-center sm:px-10 sm:py-10">
          <p className="font-serif text-3xl font-semibold tracking-[0.2em] text-[#f1d27a]">LUXOR</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.38em] text-[#caa24c]/65">Event Space</p>
        </header>

        <div className="px-5 py-7 sm:px-10 sm:py-10">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">Event proposal</p>
              <h1 className="mt-3 font-serif text-3xl font-semibold text-white sm:text-4xl">Prepared for {invoice.client_name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Review the included services and payment request below. Contact Luxor before paying if anything needs to change.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              <ShieldCheck size={14} /> Secure proposal
            </span>
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Event</p>
              <p className="mt-2 text-sm font-bold text-white">{invoice.event_type || 'Private event'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Proposal total</p>
              <p className="mt-2 font-mono text-sm font-bold text-[#f1d27a]">{money(invoice.total)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Balance due</p>
              <p className="mt-2 font-mono text-sm font-bold text-white">{money(balanceDue)}</p>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <FileText size={17} className="text-[#caa24c]" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">Included services</h2>
            </div>
            <div className="mt-2 divide-y divide-white/[0.06]">
              {invoice.line_items.map((item, index) => (
                <div key={`${item.description}-${index}`} className="flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/12 text-[#f1d27a]"><Check size={11} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-200">{item.description}</p>
                    {Number(item.quantity) > 1 ? <p className="mt-1 text-[10px] text-zinc-500">Quantity {item.quantity}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/[0.07] p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#caa24c]">{invoice.payment_requested_label || 'Payment due now'}</p>
                <p className="mt-2 font-mono text-3xl font-black text-[#f1d27a]">{money(requestedAmount)}</p>
                {paidTotal > 0 ? <p className="mt-2 text-xs text-emerald-300">{money(paidTotal)} already received</p> : null}
              </div>
              {balanceDue <= 0 ? (
                <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-6 text-xs font-black uppercase tracking-wider text-emerald-300"><Check size={16} /> Paid in full</span>
              ) : invoice.stripe_checkout_url ? (
                <a href={invoice.stripe_checkout_url} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-6 text-xs font-black uppercase tracking-wider text-[#130e08] transition hover:bg-[#dfbd68]"><CreditCard size={16} /> Continue to secure payment</a>
              ) : (
                <p className="max-w-xs text-xs leading-5 text-zinc-400">Contact Luxor for a refreshed secure payment link.</p>
              )}
            </div>
          </section>

          <footer className="mt-8 text-center text-[11px] leading-5 text-zinc-500">
            Payments are processed securely by Stripe. Questions? Email booking@luxoratlaspalmas.com.
          </footer>
        </div>
      </div>
    </main>
  )
}
