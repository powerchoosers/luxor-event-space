import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createMarketingTemplate, listMarketingTemplates } from '@/lib/luxorMarketingServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const templates = await listMarketingTemplates()
    return NextResponse.json({ templates })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load templates.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const template = await createMarketingTemplate({
      name: String(body.name || ''),
      subject: typeof body.subject === 'string' ? body.subject : '',
      description: typeof body.description === 'string' ? body.description : null,
      category: typeof body.category === 'string' ? body.category : 'custom',
      blocks: Array.isArray(body.blocks) ? body.blocks : [],
      previewColor: typeof body.previewColor === 'string' ? body.previewColor : '#caa24c',
      createdBy: session.email,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    })

    return NextResponse.json({ template })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save template.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
