import { NextRequest, NextResponse } from 'next/server'
import { addMarketingMember } from '@/lib/luxorMarketingServer'
import { createLuxorInquiry, findRecentDuplicateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { countRecentPublicAttempts, getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<LuxorInquiryInput>
    if (body.website) return NextResponse.json({ subscribed: true }, { status: 201 })
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    if (fullName.length > 120) return NextResponse.json({ error: 'Please shorten your name to 120 characters or fewer.' }, { status: 400 })
    if (body.formStartedAt && Date.now() - body.formStartedAt < 800) return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 })
    const ipHash = hashPublicRequestIp(getPublicRequestIp(request.headers))
    if (await countRecentPublicAttempts(ipHash, 'newsletter_signup_attempt') >= 6) return NextResponse.json({ error: 'Too many requests were submitted. Please wait ten minutes and try again.' }, { status: 429 })
    const input: LuxorInquiryInput = { fullName: fullName || 'Newsletter subscriber', email, source: 'newsletter', flow: 'newsletter_signup', marketingOptIn: true, formStartedAt: body.formStartedAt, sessionId: body.sessionId, attribution: body.attribution, pagePath: body.pagePath, referrer: body.referrer, metadata: { marketing_lead: true, marketing_source: 'newsletter', submitted_form: 'Newsletter Signup', newsletter_name: fullName || null } }
    await recordLuxorPublicEvent({ eventName: 'newsletter_signup_attempt', sessionId: input.sessionId, pagePath: input.pagePath, source: input.source, ipHash, metadata: { flow: input.flow } }).catch(() => undefined)
    const duplicate = await findRecentDuplicateLuxorInquiry(input)
    if (duplicate) return NextResponse.json({ subscribed: true, alreadySubscribed: true, inquiry: duplicate })
    const inquiry = await createLuxorInquiry(input, request.headers.get('user-agent') ?? undefined)
    if (!inquiry) throw new Error('Newsletter signup could not be saved.')
    await addMarketingMember(inquiry.email || email, fullName || null, 'newsletter')
    void recordLuxorPublicEvent({ eventName: 'newsletter_subscribed', sessionId: input.sessionId, pagePath: input.pagePath, source: input.source, inquiryId: inquiry.id, ipHash, metadata: { flow: input.flow, marketingLead: true } })
    void sendLuxorWebPush('booking', { title: 'New newsletter lead', body: `${fullName || email} joined the Luxor newsletter.`, url: `/portal/leads/${inquiry.id}`, tag: `luxor-newsletter-${inquiry.id}` })
    return NextResponse.json({ subscribed: true, inquiry }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join the newsletter.'
    console.error('Luxor newsletter signup failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
