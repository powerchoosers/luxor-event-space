import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan, type PortalPermission } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'

// Legacy Elena data combines several domains. Until every read is scoped,
// require all relevant permissions, including on previously saved responses.
const ELENA_REQUIRED_PERMISSIONS: PortalPermission[] = ['leads', 'emails', 'calls', 'messages', 'calendar', 'planner', 'marketing', 'finances', 'operations', 'settings', 'phone_assignment']
async function canAccessElenaData(email: string) {
  const member = await getLuxorPortalMember(email)
  return Boolean(member && member.status === 'active' && ELENA_REQUIRED_PERMISSIONS.every(permission => memberCan(member, permission)))
}

// Never persist or return confirmation bearer tokens from chat history. Old
// confirmation cards cannot be verified after a reload and must be prepared again.
function stripConfirmationSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripConfirmationSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'confirmation' && key !== 'token').map(([key, item]) => [key, stripConfirmationSecrets(item)]))
}

type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

interface ChatMessage {
  id?: string
  role: MessageRole
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: Record<string, unknown>[]
  executedQueries?: Record<string, unknown>[]
  voiceTranscript?: Array<{ role: 'user' | 'assistant'; text: string }>
  attachments?: Array<{
    id?: string
    name: string
    type: string
    kind: 'image' | 'document' | 'text'
    textContent?: string
    storagePath?: string
  }>
}

interface ElenaChatSession {
  id: string
  created_at: string
  updated_at: string
  title: string
  messages: ChatMessage[]
  user_email: string
}

export async function GET(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!await canAccessElenaData(session.email)) return NextResponse.json({ error: 'Elena history is unavailable for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 })
    if (id) {
      const chats = await supabaseRest<ElenaChatSession[]>(
        `luxor_elena_chats?id=eq.${id}&user_email=eq.${encodeURIComponent(session.email)}&select=*`
      )
      if (!chats || chats.length === 0) {
        return NextResponse.json({ error: 'Chat session not found' }, { status: 404 })
      }
      const chat = chats[0]
      const rawMessages = chat.messages || []
      const hasUserMessage = rawMessages.some((m) => m.role === 'user')
      if (!hasUserMessage) {
        chat.messages = []
      } else {
        chat.messages = rawMessages.filter((m, idx) => {
          if (idx === 0 && m.role === 'assistant' && (m.content?.includes('bestie') || m.content?.includes('Elena AI Concierge active'))) {
            return false
          }
          return true
        })
      }
      return NextResponse.json(stripConfirmationSecrets(chat))
    }

    const chats = await supabaseRest<Omit<ElenaChatSession, 'messages'>[]>(
      `luxor_elena_chats?user_email=eq.${encodeURIComponent(session.email)}&select=id,title,created_at,updated_at&order=updated_at.desc`
    )
    return NextResponse.json(chats || [])
  } catch (err: unknown) {
    console.error('Failed to get sessions:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function POST() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!await canAccessElenaData(session.email)) return NextResponse.json({ error: 'Elena history is unavailable for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

    const defaultMsg: ChatMessage[] = []

    const newChat = await supabaseRest<ElenaChatSession[]>('luxor_elena_chats', {
      method: 'POST',
      headers: {
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        title: 'New Chat Session',
        messages: defaultMsg,
        user_email: session.email
      })
    })

    if (!newChat || newChat.length === 0) {
      throw new Error('Failed to create chat session')
    }

    return NextResponse.json(newChat[0])
  } catch (err: unknown) {
    console.error('Failed to create session:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!await canAccessElenaData(session.email)) return NextResponse.json({ error: 'Elena history is unavailable for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

    const { id, title, messages, appendVoiceTranscript } = (await request.json()) as {
      id?: string
      title?: string
      messages?: ChatMessage[]
      appendVoiceTranscript?: ChatMessage
    }

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 })
    }

    if (appendVoiceTranscript !== undefined) {
      const entry = appendVoiceTranscript
      if (!entry || typeof entry !== 'object' || title !== undefined || messages !== undefined || entry.role !== 'user' || typeof entry.id !== 'string' || !/^voice-[0-9a-f-]{36}$/i.test(entry.id) || typeof entry.content !== 'string' || entry.content.length > 100_000 || !Array.isArray(entry.voiceTranscript) || entry.voiceTranscript.length > 500 || !entry.voiceTranscript.every(turn => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string') || entry.voiceTranscript.reduce((total, turn) => total + turn.text.length, 0) > 100_000) {
        return NextResponse.json({ error: 'Invalid voice transcript' }, { status: 400 })
      }
      const safeEntry: ChatMessage = { id: entry.id, role: 'user', content: entry.content, voiceTranscript: entry.voiceTranscript.map(({ role, text }) => ({ role, text })) }
      // Compare the timestamp on every update so a concurrent chat save is not overwritten.
      for (let attempt = 0; attempt < 4; attempt++) {
        const filter = `id=eq.${encodeURIComponent(id)}&user_email=eq.${encodeURIComponent(session.email)}`
        const chats = await supabaseRest<ElenaChatSession[]>(`luxor_elena_chats?${filter}&select=id,messages,updated_at`)
        const chat = chats?.[0]
        if (!chat) return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 })
        if ((chat.messages || []).some(message => message.id === entry.id)) return NextResponse.json({ saved: true })
        const updated = await supabaseRest<ElenaChatSession[]>(
          `luxor_elena_chats?${filter}&updated_at=eq.${encodeURIComponent(chat.updated_at)}`,
          { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ messages: stripConfirmationSecrets([...(chat.messages || []), safeEntry]), updated_at: new Date().toISOString() }) },
        )
        if (updated?.length) return NextResponse.json({ saved: true })
      }
      return NextResponse.json({ error: 'Chat changed while saving the voice transcript. Please try again.' }, { status: 409 })
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (title !== undefined) payload.title = title
    if (messages !== undefined) payload.messages = stripConfirmationSecrets(messages)

    const updated = await supabaseRest<ElenaChatSession[]>(
      `luxor_elena_chats?id=eq.${id}&user_email=eq.${encodeURIComponent(session.email)}`,
      {
        method: 'PATCH',
        headers: {
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json(stripConfirmationSecrets(updated[0]))
  } catch (err: unknown) {
    console.error('Failed to update session:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!await canAccessElenaData(session.email)) return NextResponse.json({ error: 'Elena history is unavailable for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 })
    }

    const deleted = await supabaseRest<ElenaChatSession[]>(
      `luxor_elena_chats?id=eq.${id}&user_email=eq.${encodeURIComponent(session.email)}`,
      {
        method: 'DELETE',
        headers: {
          'Prefer': 'return=representation'
        }
      }
    )

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Failed to delete session:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
