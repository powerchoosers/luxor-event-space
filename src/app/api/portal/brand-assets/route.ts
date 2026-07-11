import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const assets = await supabaseRest<Array<{
      id: string
      name: string
      url: string
      file_path: string
      category: string
      created_at: string
      metadata?: Record<string, unknown>
    }>>('luxor_brand_assets?select=*&order=created_at.desc')

    return NextResponse.json({ assets })
  } catch (error) {
    console.error('Failed to list brand assets:', error)
    return NextResponse.json({ error: 'Failed to list brand assets.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing brand asset ID.' }, { status: 400 })
    }

    // 1. Fetch file_path to delete from Supabase storage
    const assets = await supabaseRest<Array<{ file_path: string }>>(
      `luxor_brand_assets?id=eq.${encodeURIComponent(id)}&select=file_path`
    )
    const asset = assets?.[0]

    if (asset?.file_path) {
      const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && serviceRoleKey) {
        // Attempt file storage deletion
        await fetch(`${supabaseUrl}/storage/v1/object/${asset.file_path}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        })
      }
    }

    // 2. Delete database record
    await supabaseRest(`luxor_brand_assets?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete brand asset:', error)
    return NextResponse.json({ error: 'Failed to delete brand asset.' }, { status: 500 })
  }
}
