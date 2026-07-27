import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type EventContact = {
  id: string
  inquiry_id: string
  full_name: string
  email: string | null
  phone: string | null
  role_label: string | null
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
  if (!/^[a-f0-9-]{36}$/i.test(inquiryId)) return NextResponse.json({ error: 'A valid lead is required.' }, { status: 400 })
  const contacts = await supabaseRest<EventContact[]>(`luxor_event_contacts?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.asc`)
  return NextResponse.json({ contacts })
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const body = await request.json()
  const inquiryId = cleanText(body.inquiryId, 36)
  const fullName = cleanText(body.fullName, 160)
  const email = cleanText(body.email, 320).toLowerCase()
  if (!/^[a-f0-9-]{36}$/i.test(inquiryId) || !fullName) return NextResponse.json({ error: 'Name and a valid lead are required.' }, { status: 400 })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address or leave it blank.' }, { status: 400 })
  const [contact] = await supabaseRest<EventContact[]>('luxor_event_contacts?select=*', {
    method: 'POST',
    body: JSON.stringify({ inquiry_id: inquiryId, full_name: fullName, email: email || null, phone: cleanText(body.phone, 40) || null, role_label: cleanText(body.roleLabel, 80) || null }),
  })
  return NextResponse.json({ contact }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid contact is required.' }, { status: 400 })
  await supabaseRest(`luxor_event_contacts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  return NextResponse.json({ ok: true })
}
