import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const revalidate = 60 // Revalidate cache every 60 seconds

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page')

    if (!page) {
      return NextResponse.json({ error: 'Page parameter is required.' }, { status: 400 })
    }

    const [contentRecord] = await supabaseRest<Record<string, unknown>[]>(`luxor_site_content?page_name=eq.${encodeURIComponent(page)}&select=*`)

    if (!contentRecord) {
      return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
    }

    return NextResponse.json(contentRecord.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch site content.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
