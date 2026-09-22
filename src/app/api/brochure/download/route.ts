import { NextRequest, NextResponse } from 'next/server'
import { BROCHURE_FILENAME, getLuxorBrochurePdf } from '@/lib/luxorBrochureServer'
import { getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'

export async function GET(request: NextRequest) {
  try {
    const pdfBytes = await getLuxorBrochurePdf()

    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('session_id') || undefined
    const source = searchParams.get('source') || 'website_download'

    void recordLuxorPublicEvent({
      eventName: 'brochure_downloaded',
      sessionId,
      pagePath: request.nextUrl.pathname,
      source,
      ipHash: hashPublicRequestIp(getPublicRequestIp(request.headers)),
      metadata: {
        timestamp: new Date().toISOString(),
        referrer: request.headers.get('referer') || undefined,
      },
    }).catch(() => {
      // Non-blocking
    })

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${BROCHURE_FILENAME}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Failed to generate or download brochure:', error)
    return NextResponse.json({ error: 'Unable to download the venue brochure.' }, { status: 500 })
  }
}
