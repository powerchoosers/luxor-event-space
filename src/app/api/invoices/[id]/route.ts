import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { deleteInvoice, getInvoice, listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { deleteLuxorDocumentsByInvoice } from '@/lib/luxorDocumentsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { sameDayBookingPromotion } from '@/lib/luxorSameDayBooking'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const receipt = await supabaseRest<Array<{ id: string }>>(`luxor_payments?select=id&invoice_id=eq.${encodeURIComponent(id)}&metadata->>receipt_received=eq.true&limit=1`)
    const master = invoice.parent_invoice_id ? await getInvoice(invoice.parent_invoice_id) : invoice
    if (receipt.length || (sameDayBookingPromotion(master) && (master?.price_locked_at || master?.proposal_accepted_at))) return NextResponse.json({ error: 'Received-payment and published same-day price records must be preserved. Reconcile the receipt or issue an appropriate revision.' }, { status: 409 })

    const paidPayments = await listPaidPaymentsByInvoice(id)
    if (paidPayments.length > 0 || invoice.status === 'paid') {
      return NextResponse.json({ error: 'Paid invoices cannot be deleted because they are part of the payment record.' }, { status: 409 })
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (secretKey) {
      const stripe = new Stripe(secretKey)
      const sessions = await stripe.checkout.sessions.list({ limit: 100 })
      const matchingOpenSessions = sessions.data.filter((checkout) =>
        checkout.status === 'open' &&
        (checkout.client_reference_id === id || checkout.metadata?.invoice_id === id)
      )
      await Promise.all(matchingOpenSessions.map((checkout) => stripe.checkout.sessions.expire(checkout.id)))
    }

    await deleteLuxorDocumentsByInvoice(id)
    await deleteInvoice(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[invoice-delete] failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete invoice.' }, { status: 500 })
  }
}
