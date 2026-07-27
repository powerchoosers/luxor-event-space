import { NextRequest, NextResponse } from 'next/server'
import { canPurchaseLuxorPhoneNumbers, getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { activateLuxorNumber, listOwnedLuxorNumbers, purchaseLuxorNumber, searchAvailableLuxorNumbers, setPublicLuxorNumber } from '@/lib/luxorPhoneNumbersServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'owned'
    if (mode === 'available') {
      if (!canPurchaseLuxorPhoneNumbers(session.email)) return NextResponse.json({ error: 'Only Arianna’s approved owner account can search for and purchase numbers.' }, { status: 403 })
      return NextResponse.json(await searchAvailableLuxorNumbers(request.nextUrl.searchParams.get('areaCode') || ''), { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ numbers: await listOwnedLuxorNumbers(), canPurchase: canPurchaseLuxorPhoneNumbers(session.email) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: twilioErrorMessage(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const body = await request.json() as { action?: 'purchase' | 'activate' | 'set_public'; phoneNumber?: string; confirmation?: string; sid?: string; monthlyPrice?: number | null; priceUnit?: string | null }
    if (body.action === 'purchase') {
      if (!canPurchaseLuxorPhoneNumbers(session.email)) return NextResponse.json({ error: 'Only Arianna’s approved owner account can purchase Twilio numbers.' }, { status: 403 })
      const number = await purchaseLuxorNumber({ phoneNumber: body.phoneNumber || '', confirmation: body.confirmation || '', ownerEmail: session.email, monthlyPrice: body.monthlyPrice, priceUnit: body.priceUnit })
      return NextResponse.json({ number }, { status: 201 })
    }
    if (body.action === 'activate') {
      const number = await activateLuxorNumber(body.sid || '', session.email)
      return NextResponse.json({ number })
    }
    if (body.action === 'set_public') {
      const number = await setPublicLuxorNumber(body.sid || '', session.email)
      return NextResponse.json({ number })
    }
    return NextResponse.json({ error: 'Choose purchase, activate, or set public.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: twilioErrorMessage(error) }, { status: 500 })
  }
}

function twilioErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Twilio could not complete that phone-number request.'
}
