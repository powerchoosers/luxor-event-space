import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { updateInvoice } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })

  try {
    const stripe = new Stripe(secretKey)
    const signature = request.headers.get('stripe-signature')
    if (!signature) return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
    const event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const invoiceId = session.metadata?.invoice_id || session.client_reference_id
      if (invoiceId && session.payment_status === 'paid') {
        await updateInvoice(invoiceId, { status: 'paid', paid_at: new Date().toISOString() })
        await supabaseRest('luxor_payments?on_conflict=processor,processor_reference', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            invoice_id: invoiceId,
            inquiry_id: session.metadata?.inquiry_id || null,
            amount: Number(session.amount_total || 0) / 100,
            status: 'paid',
            payment_method: 'stripe_checkout',
            paid_at: new Date().toISOString(),
            processor: 'stripe',
            processor_reference: session.id,
            metadata: { payment_intent: session.payment_intent || null },
          }),
        })
      }
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook.' }, { status: 400 })
  }
}
