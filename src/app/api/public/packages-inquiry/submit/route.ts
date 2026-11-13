import { NextRequest, NextResponse } from 'next/server'
import { submitPublicPackagesInquiry } from '@/lib/luxorPublicPackagesInquirySubmitServer'
import { hasValidLuxorInquiryConsentFlags } from '@/lib/luxorInquiryTypes'
import { getPublicRequestIp, hashPublicRequestIp } from '@/lib/luxorPublicEventsServer'

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export async function POST(request: NextRequest) {
  try {
    const body = object(await request.json().catch(() => null))
    if (!body || !hasValidLuxorInquiryConsentFlags(body)) {
      return NextResponse.json({ error: 'Consent choices must be submitted as separate true or false values.' }, { status: 400 })
    }
    const draftToken = typeof body.draftToken === 'string' ? body.draftToken.trim() : ''
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!draftToken) return NextResponse.json({ error: 'Your event configuration is missing. Return to Packages.' }, { status: 400 })
    if (!firstName || !lastName) return NextResponse.json({ error: 'Enter your first and last name.' }, { status: 400 })
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    if (!phone || phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  if (body.website) return NextResponse.json({ inquiry: null }, { status: 201 })

    const requestKey = request.headers.get('idempotency-key')?.trim()
    if (requestKey && requestKey.length < 8) {
      return NextResponse.json({ error: 'Invalid submission key. Refresh and try again.' }, { status: 400 })
    }

    const isTest = body.isTest === true
    const result = await submitPublicPackagesInquiry({
      draftToken,
      firstName,
      lastName,
      email,
      phone,
      emailInquiryOptIn: body.emailInquiryOptIn === true,
      smsOptIn: body.smsOptIn === true,
      smsMarketingOptIn: body.smsMarketingOptIn === true,
      marketingOptIn: body.marketingOptIn === true,
      locale: body.locale === 'es' ? 'es' : 'en',
      pagePath: typeof body.pagePath === 'string' ? body.pagePath : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      formStartedAt: typeof body.formStartedAt === 'number' ? body.formStartedAt : undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      idempotencyKey: requestKey,
      ipHash: hashPublicRequestIp(getPublicRequestIp(request.headers)),
      isTest,
    })

    if (result.replayed) {
      return NextResponse.json({ inquiry: result.inquiry, replayed: true }, { status: 200 })
    }

    return NextResponse.json({
      inquiry: result.inquiry,
      quote: {
        totals: result.quote.totals,
        summaryLines: result.quote.summaryLines,
      },
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to submit your inquiry.' }, { status: 500 })
  }
}
