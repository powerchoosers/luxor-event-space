import { NextRequest, NextResponse } from 'next/server'
import {
  parseMarketVendorFormData,
  partnerApplicationsSchemaUnavailable,
  submitLuxorMarketVendorApplication,
} from '@/lib/luxorPartnerApplicationsServer'
import { LUXOR_MARKET_VENDOR_SPACES, type LuxorMarketVendorSpaceKey } from '@/lib/luxorPartnerApplicationTypes'
import { countRecentPublicAttempts, getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'

const EVENT_NAME = 'partner_application_attempt'

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const parsed = parseMarketVendorFormData(form)

    if (parsed.websiteHoneypot) {
      return NextResponse.json({ application: { id: null }, replayed: false }, { status: 201 })
    }

    const submissionKey = request.headers.get('idempotency-key')?.trim() || String(form.get('submissionKey') || '').trim()
    if (!submissionKey || submissionKey.length < 8) {
      return NextResponse.json({ error: 'Refresh the page and try again.' }, { status: 400 })
    }

    const ipHash = hashPublicRequestIp(getPublicRequestIp(request.headers))
    try {
      const recentAttempts = await countRecentPublicAttempts(ipHash, EVENT_NAME, 10)
      if (recentAttempts >= 5) {
        return NextResponse.json(
          { error: 'Too many applications were submitted. Please wait ten minutes and try again.' },
          { status: 429 },
        )
      }
      await recordLuxorPublicEvent({
        eventName: EVENT_NAME,
        pagePath: '/work-with-us/market-vendor',
        source: 'market_vendor',
        ipHash,
        metadata: { type: 'market_vendor' },
      })
    } catch (protectionError) {
      console.warn('Partner application protection event could not be recorded:', protectionError)
    }

    if (!(parsed.selectedSpace in LUXOR_MARKET_VENDOR_SPACES)) {
      return NextResponse.json({ error: 'Choose a vendor space.' }, { status: 400 })
    }

    const result = await submitLuxorMarketVendorApplication({
      businessName: parsed.businessName,
      contactName: parsed.contactName,
      email: parsed.email,
      phone: parsed.phone,
      instagramHandle: parsed.instagramHandle,
      city: parsed.city,
      websiteUrl: parsed.websiteUrl || undefined,
      vendorCategory: parsed.vendorCategory,
      productDescription: parsed.productDescription,
      selectedSpace: parsed.selectedSpace as LuxorMarketVendorSpaceKey,
      requiresElectricity: parsed.requiresElectricity,
      additionalDisplays: parsed.additionalDisplays,
      guidelinesAcknowledged: parsed.guidelinesAcknowledged,
      finalAcknowledged: parsed.finalAcknowledged,
      formStartedAt: parsed.formStartedAt,
      submissionKey,
      ipHash,
      userAgent: request.headers.get('user-agent') ?? undefined,
      photos: parsed.photos,
    })

    const status = result.replayed ? 200 : 201
    return NextResponse.json(
      {
        applicationId: result.application.id,
        replayed: result.replayed,
        message:
          'Your application has been received and is pending review. Luxor will follow up by email after your submission is reviewed.',
      },
      { status },
    )
  } catch (error) {
    if (partnerApplicationsSchemaUnavailable(error)) {
      return NextResponse.json(
        { error: 'Applications are temporarily unavailable. Please try again later or call Luxor.' },
        { status: 503 },
      )
    }
    const message = error instanceof Error ? error.message : 'Unable to submit your application.'
    const status = /wait a moment|too many/i.test(message) ? 429 : 400
    return NextResponse.json({ error: message }, { status })
  }
}