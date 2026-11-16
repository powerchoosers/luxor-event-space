import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const records = await supabaseRest<Record<string, unknown>[]>('luxor_site_content?select=*')
    return NextResponse.json(records)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch content.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { page_name, content } = body

    if (!page_name || !content) {
      return NextResponse.json({ error: 'page_name and content are required' }, { status: 400 })
    }

    if (page_name === 'public_actions') {
      const allowed = ['brochure', 'packages', 'visit']
      if (typeof content !== 'object' || !allowed.includes(content.hero) || !allowed.includes(content.other) || Object.keys(content).some((key) => !['hero', 'other', 'headline', 'introduction'].includes(key)) || (content.headline !== undefined && (typeof content.headline !== 'string' || !content.headline.trim() || content.headline.length > 100)) || (content.introduction !== undefined && (typeof content.introduction !== 'string' || !content.introduction.trim() || content.introduction.length > 240))) {
        return NextResponse.json({ error: 'Choose a valid destination for each button.' }, { status: 400 })
      }
    }

    const [record] = await supabaseRest<Record<string, unknown>[]>('luxor_site_content?on_conflict=page_name', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify({ page_name, content })
    })

    return NextResponse.json(record)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save content.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
