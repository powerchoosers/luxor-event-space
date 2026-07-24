import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken, updateInvoice } from '@/lib/luxorInvoicesServer'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice?.stripe_checkout_url || invoice.status === 'cancelled') {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }

  let checkoutUrl: URL
  try {
    checkoutUrl = new URL(invoice.stripe_checkout_url)
  } catch {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }

  if (checkoutUrl.protocol !== 'https:' || (checkoutUrl.hostname !== 'stripe.com' && !checkoutUrl.hostname.endsWith('.stripe.com'))) {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }

  if (!invoice.stripe_checkout_opened_at) {
    await updateInvoice(invoice.id, { stripe_checkout_opened_at: new Date().toISOString() })
  }

  return NextResponse.redirect(checkoutUrl)
}
