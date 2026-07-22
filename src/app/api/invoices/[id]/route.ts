import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { deleteInvoice, getInvoice, listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { deleteLuxorDocumentsByInvoice } from '@/lib/luxorDocumentsServer'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

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
