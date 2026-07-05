import { NextRequest, NextResponse } from 'next/server'
import { recordMarketingClick } from '@/lib/luxorMarketingServer'

function normalizeRedirectUrl(url: string | null) {
  const value = String(url || '').trim()
  if (!value) return null
  if (/^(mailto:|tel:|https?:\/\/)/i.test(value)) return value
  if (/^\/\//.test(value)) return `https:${value}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  if (/[.][a-z]{2,}([/?#]|$)/i.test(value)) return `https://${value}`
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const redirectUrl = normalizeRedirectUrl(request.nextUrl.searchParams.get('u'))

  if (!redirectUrl) {
    return new NextResponse('Missing redirect URL', { status: 400 })
  }

  try {
    await recordMarketingClick(token, redirectUrl, request)
  } catch (error) {
    console.error('Luxor marketing click tracking failed:', error instanceof Error ? error.message : error)
  }

  return NextResponse.redirect(redirectUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
