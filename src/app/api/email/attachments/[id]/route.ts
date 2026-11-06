import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { findLuxorSharedMailboxByAddress } from '@/lib/luxorSharedMailboxes'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { downloadLuxorZohoAttachment } from '@/lib/zohoMailServer'
import { downloadLuxorMailAttachment } from '@/lib/luxorMailboxServer'

function inferContentType(filename: string, contentType: string) {
  if (contentType && contentType !== 'application/octet-stream') return contentType
  const extension = filename.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    csv: 'text/csv', txt: 'text/plain', json: 'application/json',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return types[extension || ''] || contentType || 'application/octet-stream'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const { id: messageId } = await params
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'emails')) return NextResponse.json({ error: 'Email access required.' }, { status: 403 })
    if (messageId.startsWith('mail-')) {
      const id = messageId.slice(5)
      if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid message.' }, { status: 400 })
      const [message] = await supabaseRestStrict<Array<{ to_addresses: string[]; cc_addresses: string[]; from_address: string }>>(`luxor_mail_messages?id=eq.${id}&select=to_addresses,cc_addresses,from_address&limit=1`)
      if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
      if ([...(message.to_addresses || []), ...(message.cc_addresses || []), message.from_address].filter(Boolean).some((address) => findLuxorSharedMailboxByAddress(address)) && !['owner', 'admin'].includes(member.role)) return NextResponse.json({ error: 'Shared mailbox access required.' }, { status: 403 })
    } else if (!['owner', 'admin'].includes(member.role)) {
      // Legacy Zoho attachment references do not identify the owning mailbox.
      return NextResponse.json({ error: 'This attachment requires mailbox administrator access.' }, { status: 403 })
    }
    const searchParams = new URL(request.url).searchParams
    const attachmentId = searchParams.get('attachmentId') || undefined
    const attachmentPath = searchParams.get('attachmentPath') || undefined
    const filename = (searchParams.get('filename') || 'attachment').replace(/["\r\n]/g, '').trim() || 'attachment'
    const folderId = searchParams.get('folderId') || undefined

    if (!messageId || (!attachmentId && !attachmentPath)) {
      return NextResponse.json({ error: 'Attachment reference is incomplete.' }, { status: 400 })
    }

    const result = messageId.startsWith('mail-')
      ? await downloadLuxorMailAttachment(messageId, attachmentId || '')
      : await downloadLuxorZohoAttachment({ messageId, attachmentId, attachmentPath, folderId })
    const servedFilename = ('filename' in result && typeof result.filename === 'string' ? result.filename : filename).replace(/["\r\n]/g, '')
    const contentType = inferContentType(servedFilename, result.contentType)
    const safeInline = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i.test(contentType)
    return new NextResponse(result.bytes as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${servedFilename.replace(/[^\x20-\x7e]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Error fetching email attachment:', error)
    return NextResponse.json({ error: 'Failed to fetch email attachment.' }, { status: 502 })
  }
}
