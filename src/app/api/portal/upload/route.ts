import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as unknown as {
      name: string
      size: number
      type: string
      arrayBuffer: () => Promise<ArrayBuffer>
    } | null

    const name = formData.get('name') as string | null
    const category = formData.get('category') as string | null
    const makeBrandAsset = formData.get('makeBrandAsset') === 'true'

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No valid file uploaded.' }, { status: 400 })
    }

    // Prepare buffer and clean filename
    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${Date.now()}-${sanitizedName}`

    // Get Supabase credentials
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration is missing on the server.')
    }

    // 1. Ensure the 'email-assets' bucket exists (creates if missing)
    try {
      await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'email-assets',
          name: 'email-assets',
          public: true,
        }),
      })
    } catch (e) {
      // Ignore if bucket already exists
    }

    // 2. Upload file to public storage bucket
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/email-assets/${filename}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: buffer,
    })

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text()
      throw new Error(`Failed to upload file to storage: ${errorText}`)
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/${filename}`

    // 3. Register as a Brand Asset if requested
    let brandAsset = null
    if (makeBrandAsset) {
      const results = await supabaseRest<Array<{
        id: string
        name: string
        url: string
        file_path: string
        category: string
        created_at: string
      }>>('luxor_brand_assets?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          name: name?.trim() || file.name,
          url: publicUrl,
          file_path: `email-assets/${filename}`,
          category: category || 'general',
          metadata: { size: file.size, type: file.type, uploaded_by: session.email },
        }),
      })
      brandAsset = results?.[0] || null
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      brandAsset,
    })
  } catch (error) {
    console.error('File upload failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 }
    )
  }
}
