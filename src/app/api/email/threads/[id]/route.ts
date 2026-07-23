import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorEmailThreadContext } from '@/lib/luxorEmailThreadContextServer'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Thread ID is required.' }, { status: 400 })
    return NextResponse.json(await getLuxorEmailThreadContext(id))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load this conversation.'
    const rateLimited = /too many requests|rate.?limit|briefly rate limiting/i.test(message)
    console.error('Luxor email thread load failed:', message)
    return NextResponse.json(
      {
        error: rateLimited
          ? 'Zoho is briefly pacing conversation requests. The selected email remains available while the thread cools down.'
          : message,
      },
      {
        status: rateLimited ? 503 : 500,
        headers: rateLimited ? { 'Retry-After': '30' } : undefined,
      },
    )
  }
}
