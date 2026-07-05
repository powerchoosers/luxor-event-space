import { NextRequest, NextResponse } from 'next/server'
import { recordMarketingOpen } from '@/lib/luxorMarketingServer'

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const trackingToken = token.replace(/\.png$/i, '')

  try {
    await recordMarketingOpen(trackingToken, request)
  } catch (error) {
    console.error('Luxor marketing open tracking failed:', error instanceof Error ? error.message : error)
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
