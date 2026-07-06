import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { deleteMarketingTemplate, markMarketingTemplateUsed } from '@/lib/luxorMarketingServer'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = await params

    if (body.action === 'mark-used') {
      await markMarketingTemplateUsed(id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unsupported template action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update template.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id } = await params
    await deleteMarketingTemplate(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete template.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
