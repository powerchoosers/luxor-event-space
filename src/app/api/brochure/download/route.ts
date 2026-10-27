import { NextRequest, NextResponse } from 'next/server'
import { BROCHURE_FILENAME, getLuxorBrochurePdf } from '@/lib/luxorBrochureServer'
import { getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
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

    try {
      const current = await supabaseRest<Array<{ upload_id: string }>>('luxor_brochure_current?singleton=eq.true&select=upload_id')
      if (current[0]) {
        const uploads = await supabaseRest<Array<{ object_path: string; validated_at: string | null }>>(`luxor_brochure_uploads?id=eq.${encodeURIComponent(current[0].upload_id)}&select=object_path,validated_at`)
        const upload = uploads[0]
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!upload?.validated_at || !url || !key) throw new Error('Current brochure unavailable.')
        const client = createClient(url, key, { auth: { persistSession: false } })
        const { data, error } = await client.storage.from('luxor-brochures').createSignedUrl(upload.object_path, 60, { download: BROCHURE_FILENAME })
        if (error || !data) throw error || new Error('Unable to access current brochure.')
        const response = NextResponse.redirect(data.signedUrl, 302)
        response.headers.set('Cache-Control', 'no-store')
        return response
      }
    } catch (error) {
      console.error('Current brochure unavailable; serving packaged fallback:', error)
    }
    const pdfBytes = await getLuxorBrochurePdf()

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${BROCHURE_FILENAME}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to generate or download brochure:', error)
    return NextResponse.json({ error: 'Unable to download the venue brochure.' }, { status: 500 })
  }
}
