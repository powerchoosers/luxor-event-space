import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { generatePublicElenaReply, type PublicElenaMessage } from '@/lib/luxorElenaServer'

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.role === 'agent' || !memberCan(member, 'settings')) {
      return NextResponse.json({ error: 'Elena preview is managed by an owner or administrator.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { messages?: PublicElenaMessage[] }
    const messages = Array.isArray(body.messages)
      ? body.messages.filter((message): message is PublicElenaMessage => (
        (message?.role === 'user' || message?.role === 'assistant')
        && typeof message.content === 'string'
        && Boolean(message.content.trim())
      )).slice(-10).map((message) => ({ role: message.role, content: message.content.trim().slice(0, 2000) }))
      : []

    if (!messages.length) return NextResponse.json({ error: 'Ask Elena a question to start the preview.' }, { status: 400 })
    return NextResponse.json(await generatePublicElenaReply(messages, 'draft'))
  } catch (error) {
    console.error('Elena preview failed:', error)
    return NextResponse.json({ error: 'Elena preview is unavailable. Please try again.' }, { status: 503 })
  }
}
