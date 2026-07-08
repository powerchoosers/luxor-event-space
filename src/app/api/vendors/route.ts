import { NextRequest, NextResponse } from 'next/server'
import { listAllVendors } from '@/lib/luxorVendorsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const vendors = await listAllVendors()
    return NextResponse.json(vendors)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vendors.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
