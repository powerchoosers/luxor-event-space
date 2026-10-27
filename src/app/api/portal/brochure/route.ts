import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { MAX_BROCHURE_BYTES, validateBrochurePdf } from '@/lib/luxorBrochureValidation'

async function authorize() {
  const session = await getLuxorPortalSession()
  const member = session ? await getLuxorPortalMember(session.email) : null
  return session && member && member.role !== 'agent' && memberCan(member, 'settings') ? session : null
}

function storage() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Storage is unavailable.')
  return createClient(url, key, { auth: { persistSession: false } }).storage.from('luxor-brochures')
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin')
    if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
    const session = await authorize()
    if (!session) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
    const body = await request.json()
    if (body.action === 'prepare') {
      if (typeof body.name !== 'string' || !body.name.toLowerCase().endsWith('.pdf') || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > MAX_BROCHURE_BYTES) {
        return NextResponse.json({ error: 'Choose a PDF no larger than 100 MB.' }, { status: 400 })
      }
      const id = randomUUID()
      const path = `${id}.pdf`
      const current = await supabaseRest<Array<{ upload_id: string }>>('luxor_brochure_current?singleton=eq.true&select=upload_id')
      const { data, error } = await storage().createSignedUploadUrl(path, { upsert: false })
      if (error || !data) throw error || new Error('Unable to prepare upload.')
      await supabaseRest('luxor_brochure_uploads', { method: 'POST', body: JSON.stringify({ id, object_path: path, uploaded_by: session.email, original_name: body.name.slice(0, 255), expected_size: body.size, expected_current_id: current[0]?.upload_id || null }) })
      return NextResponse.json({ id, signedUrl: data.signedUrl })
    }
    if (body.action === 'publish' && typeof body.id === 'string' && /^[0-9a-f-]{36}$/.test(body.id)) {
      const rows = await supabaseRest<Array<{ id: string; object_path: string; expected_size: number; expected_current_id: string | null; validated_at: string | null }>>(`luxor_brochure_uploads?id=eq.${encodeURIComponent(body.id)}&uploaded_by=eq.${encodeURIComponent(session.email)}&select=*`)
      const upload = rows[0]
      if (!upload || upload.validated_at) return NextResponse.json({ error: 'Upload not found.' }, { status: 404 })
      const { data, error } = await storage().download(upload.object_path)
      if (error || !data || data.size !== upload.expected_size || data.size > MAX_BROCHURE_BYTES) return NextResponse.json({ error: 'Upload is incomplete.' }, { status: 400 })
      const pages = await validateBrochurePdf(new Uint8Array(await data.arrayBuffer()))
      await supabaseRest(`luxor_brochure_uploads?id=eq.${upload.id}`, { method: 'PATCH', body: JSON.stringify({ validated_at: new Date().toISOString(), page_count: pages }) })
      if (upload.expected_current_id) {
        const changed = await supabaseRest<Array<{ upload_id: string }>>(`luxor_brochure_current?singleton=eq.true&upload_id=eq.${encodeURIComponent(upload.expected_current_id)}&select=upload_id`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ upload_id: upload.id, updated_at: new Date().toISOString() }) })
        if (!changed.length) return NextResponse.json({ error: 'The brochure changed during your upload. Please choose your file again.' }, { status: 409 })
      } else {
        // The singleton primary key prevents two first publications from both succeeding.
        await supabaseRest('luxor_brochure_current', { method: 'POST', body: JSON.stringify({ singleton: true, upload_id: upload.id, updated_at: new Date().toISOString() }) })
      }
      return NextResponse.json({ success: true, pages })
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  } catch (error) {
    console.error('Brochure upload failed:', error)
    return NextResponse.json({ error: 'Unable to publish the brochure. The current brochure is unchanged.' }, { status: 500 })
  }
}
