import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan, type PortalPermission } from '@/lib/luxorPortalAccess'
import { isElenaChatAttachmentStoragePath, signElenaChatAttachmentUrl } from '@/lib/luxorElenaChatAttachmentsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

const ELENA_REQUIRED_PERMISSIONS: PortalPermission[] = ['leads', 'emails', 'calls', 'messages', 'calendar', 'planner', 'marketing', 'finances', 'operations', 'settings', 'phone_assignment']

export async function GET(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !ELENA_REQUIRED_PERMISSIONS.every((permission) => memberCan(member, permission))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const chatId = url.searchParams.get('chatId')
  const storagePath = url.searchParams.get('storagePath')
  const downloadName = url.searchParams.get('name')?.trim() || 'attachment'

  if (
    !chatId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chatId)
    || typeof storagePath !== 'string'
    || !storagePath.trim()
    || !isElenaChatAttachmentStoragePath(chatId, storagePath)
  ) {
    return NextResponse.json({ error: 'Invalid attachment request.' }, { status: 400 })
  }

  const chats = await supabaseRest<Array<{ id: string }>>(
    `luxor_elena_chats?id=eq.${chatId}&user_email=eq.${encodeURIComponent(session.email)}&select=id&limit=1`,
  )
  if (!chats?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const signed = await signElenaChatAttachmentUrl(storagePath, downloadName.slice(0, 200))
    return NextResponse.json(signed)
  } catch {
    return NextResponse.json({ error: 'Could not open attachment.' }, { status: 500 })
  }
}
