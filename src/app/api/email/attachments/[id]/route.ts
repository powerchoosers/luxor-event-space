import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { downloadLuxorZohoAttachment } from '@/lib/zohoMailServer'

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
    if (!(await getLuxorPortalSession())) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const { id: messageId } = await params
    const searchParams = new URL(request.url).searchParams
    const attachmentId = searchParams.get('attachmentId') || undefined
    const attachmentPath = searchParams.get('attachmentPath') || undefined
    const filename = (searchParams.get('filename') || 'attachment').replace(/["\r\n]/g, '').trim() || 'attachment'
    const folderId = searchParams.get('folderId') || undefined

    if (!messageId || (!attachmentId && !attachmentPath)) {
      return NextResponse.json({ error: 'Attachment reference is incomplete.' }, { status: 400 })
    }

    const result = await downloadLuxorZohoAttachment({ messageId, attachmentId, attachmentPath, folderId })
    return new NextResponse(result.bytes as BodyInit, {
      headers: {
        'Content-Type': inferContentType(filename, result.contentType),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Error fetching email attachment:', error)
    return NextResponse.json({ error: 'Failed to fetch email attachment.' }, { status: 502 })
  }
}
