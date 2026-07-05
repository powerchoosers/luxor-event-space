import { NextResponse } from 'next/server'
import { getZohoAuthUrl } from '@/lib/zohoOAuthSetup'

export async function GET(request: Request) {
  try {
    return NextResponse.redirect(getZohoAuthUrl(request))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Zoho authorization.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
