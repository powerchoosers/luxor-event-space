import { Check, FileCheck2, FileText, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getInvoiceByPublicToken, markLuxorProposalViewed } from '@/lib/luxorInvoicesServer'
import { cancelQueuedLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { formatLuxorOfferExpiry, isLuxorOfferExpired, luxorOfferSnapshot } from '@/lib/luxorOffer'
import { AcceptProposalButton } from '@/components/proposal/AcceptEstimateButton'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from '@/lib/luxorBookingMoney'
import { createNote } from '@/lib/luxorNotesServer'
import { getVerifiedLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const dynamic = 'force-dynamic'

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function dateLabel(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default async function ClientProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn') notFound()

  const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
  const booking = invoice.booking_id
    ? await getLuxorBooking(invoice.booking_id)
    : bookings.find((item) => item.invoice_id === invoice.id)
  const context = (invoice.proposal_context && typeof invoice.proposal_context === 'object'
    ? invoice.proposal_context
    : {}) as Record<string, unknown>
  const offerExpired = isLuxorOfferExpired(invoice)
  const offer = luxorOfferSnapshot(invoice)
  const isPublished = invoice.status === 'sent' && Boolean(invoice.price_locked_at)
  const isAccepted = Boolean(invoice.proposal_accepted_at) || Boolean(booking)
  const contractSigned = booking?.contract_status === 'signed'
  const finalPrice = Number(context.final_event_price ?? invoice.total ?? 0)
  const refundableSecurityDeposit = Number(context.refundable_security_deposit ?? booking?.security_deposit_amount ?? LUXOR_DEFAULT_SECURITY_DEPOSIT)
  const eventDate = dateLabel(context.event_date)
  const expectedGuestCount = Number(context.expected_guest_count || 0)
  const serviceItems = invoice.line_items.filter((item) =>
    item.category !== 'Security Deposit' && !/refundable security deposit/i.test(item.description),
  )
  const itemTotal = (item: typeof serviceItems[number]) => Number(item.total ?? Number(item.quantity || 1) * Number(item.unitPrice || 0))
  // Package detail rows are genuine inclusions, not $0 services the client
  // needs to interpret as a price. Keep them in a clear inclusion list while
  // the financial section shows only priced components and adjustments.
  const pricedServiceItems = serviceItems.filter((item) => !(item.pricingRole === 'included' && Math.abs(itemTotal(item)) < 0.005))
  const includedServiceItems = serviceItems.filter((item) => item.pricingRole === 'included' && Math.abs(itemTotal(item)) < 0.005)

  // A portal preview must never look like a client engagement event. Validate
  // the signed portal session rather than trusting the mere presence of a
  // cookie with that name.
  const isInternalOwner = Boolean(await getVerifiedLuxorPortalSession())
  if (isPublished && !invoice.proposal_viewed_at && !isInternalOwner) {
    const firstView = await markLuxorProposalViewed(invoice.id)
    if (firstView && invoice.inquiry_id) {
      const results = await Promise.allSettled([
        cancelQueuedLuxorEmailJobs(invoice.inquiry_id, ['proposal_view_reminder']),
        createNote(
          invoice.inquiry_id,
          `Final proposal opened by ${invoice.client_name} in the secure proposal portal.`,
          'status_change',
          'Proposal Portal',
        ),
      ])
      results.filter((result) => result.status === 'rejected').forEach((result) => {
        console.error('Proposal view was recorded, but a follow-up activity action failed:', result.reason)
      })
    }
  }

  const status = offerExpired
    ? { eyebrow: 'Proposal expired', title: 'Please request a refreshed proposal', copy: 'This final proposal is no longer available at the prior price. Please contact Luxor for a revised proposal.', tone: 'amber' }
    : contractSigned
      ? { eyebrow: 'Agreement complete', title: 'Your secure payment link is on its way', copy: 'Luxor has sent the next payment link after your signed Event Agreement. The refundable security deposit remains separately tracked.', tone: 'emerald' }
      : isAccepted
        ? { eyebrow: 'Proposal accepted', title: 'Your Event Agreement has been sent', copy: 'Please review and sign the agreement from your Luxor email. A Stripe payment link is sent only after the agreement is signed.', tone: 'gold' }
        : { eyebrow: 'Final proposal', title: 'Review and select your package', copy: 'This is the final calculated price for the services shown below. Selecting it creates your Event Agreement; it does not charge you.', tone: 'gold' }

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
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">{status.eyebrow}</p>
              <h1 className="mt-3 font-serif text-3xl font-semibold text-white sm:text-4xl">Prepared for {invoice.client_name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{status.copy}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              <ShieldCheck size={14} /> Secure private proposal
            </span>
          </div>

          {!isPublished ? <section className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Awaiting final review</p><p className="mt-2 text-sm leading-6 text-amber-100/85">Luxor has not published a final, price-locked proposal at this link yet. Please contact the team if you expected one.</p></section> : null}

          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Event</p>
              <p className="mt-2 text-sm font-bold text-white">{typeof context.event_type === 'string' ? context.event_type : invoice.event_type || 'Private event'}</p>
              {eventDate ? <p className="mt-1 text-xs text-zinc-400">{eventDate}</p> : null}
              {expectedGuestCount > 0 ? <p className="mt-1 text-xs text-zinc-500">Expected guest count: {expectedGuestCount}</p> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Final Event Price</p>
              {offer.active ? <p className="mt-2 font-mono text-xs text-zinc-500 line-through">{money(offer.originalTotal)}</p> : null}
              <p className="mt-2 font-mono text-sm font-bold text-[#f1d27a]">{money(finalPrice)}</p>
              <p className="mt-1 text-[10px] text-zinc-500">Price locked when published</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Refundable Security Deposit</p>
              <p className="mt-2 font-mono text-sm font-bold text-white">{money(refundableSecurityDeposit)}</p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">Separate from the Event Price</p>
            </div>
          </section>

          {offer.active ? <section className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-5 sm:p-6"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Approved promotion applied</p><p className="mt-2 text-lg font-bold text-white">Save {money(offer.savings)} ({offer.percent}%)</p><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/80">This approved reduction is already included in the Final Event Price.</p></section> : null}
          {!offer.active && !offerExpired && invoice.offer_expires_at ? <section className="mt-5 rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/[0.07] p-5 sm:p-6"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f1d27a]">Proposal availability</p><p className="mt-2 text-sm leading-6 text-zinc-200">Please select this proposal by {formatLuxorOfferExpiry(invoice.offer_expires_at) || 'the stated deadline'}.</p></section> : null}
          {offerExpired ? <section className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5 sm:p-6"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Proposal expired</p><p className="mt-2 text-sm leading-6 text-amber-100/85">This proposal is no longer available at the previous price. Please contact Luxor for a refreshed final proposal.</p></section> : null}

          <section className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4"><FileText size={17} className="text-[#caa24c]" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">Package breakdown</h2></div>
            <div className="mt-2 divide-y divide-white/[0.06]">
              {pricedServiceItems.map((item, index) => {
                const amount = itemTotal(item)
                const isIncluded = item.pricingRole === 'included'
                return <div key={`${item.description}-${index}`} className="flex items-start gap-3 py-3.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/12 text-[#f1d27a]"><Check size={11} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"><p className="text-sm font-semibold text-zinc-200">{item.description}</p><p className="font-mono text-sm text-zinc-300">{money(amount)}</p></div><p className="mt-1 text-[10px] text-zinc-500">{isIncluded ? 'Included in your package' : item.required ? 'Required for this event' : Number(item.quantity) > 1 ? `Quantity ${item.quantity}` : item.category || 'Selected service'}</p></div></div>
              })}
            </div>
            <div className="mt-4 border-t border-white/10 pt-4 text-right"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Final Event Price</p><p className="mt-1 font-mono text-xl font-black text-[#f1d27a]">{money(finalPrice)}</p></div>
          </section>

          {includedServiceItems.length ? <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><div className="flex items-center gap-3 border-b border-white/10 pb-4"><Check size={17} className="text-[#caa24c]" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">What&apos;s included</h2></div><ul className="mt-4 grid gap-2.5 sm:grid-cols-2">{includedServiceItems.map((item, index) => <li key={`${item.description}-${index}`} className="flex gap-2 text-sm leading-5 text-zinc-300"><Check size={14} className="mt-0.5 shrink-0 text-[#f1d27a]" /><span>{item.description}</span></li>)}</ul></section> : null}

          <section className="mt-5 rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/[0.07] p-5 sm:p-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#f1d27a]" size={18} /><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f1d27a]">Refundable Security Deposit</p><p className="mt-2 text-sm leading-6 text-zinc-200">Separate refundable security deposit required for all bookings. Deposit is held throughout the event period and is returned following the post-event inspection, subject to the terms of the Event Agreement.</p></div></div></section>

          {isPublished && !offerExpired && !isAccepted ? <section className="mt-8 rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/[0.07] p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Ready to move forward?</p><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-200">Selecting this final proposal does not charge you. Luxor will email your Event Agreement next; your secure Stripe payment link comes only after the agreement is signed.</p></div><AcceptProposalButton token={token} /></div></section> : null}
          {isAccepted ? <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div className="flex gap-3"><FileCheck2 className="mt-0.5 shrink-0 text-[#f1d27a]" size={19} /><div><p className="text-sm font-bold text-white">{status.title}</p><p className="mt-2 text-sm leading-6 text-zinc-300">{status.copy}</p></div></div></section> : null}

          <footer className="mt-8 text-center text-[11px] leading-5 text-zinc-500">Final proposals are separate from the Event Agreement and payment. Questions? Email booking@luxoratlaspalmas.com.</footer>
        </div>
      </div>
    </main>
  )
}
