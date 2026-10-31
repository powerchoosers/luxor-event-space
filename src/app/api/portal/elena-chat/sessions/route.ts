import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

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
      return NextResponse.json(chat)
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

    const { id, title, messages, appendVoiceTranscript } = (await request.json()) as {
      id?: string
      title?: string
      messages?: ChatMessage[]
      appendVoiceTranscript?: ChatMessage
    }

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
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
          { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ messages: [...(chat.messages || []), safeEntry], updated_at: new Date().toISOString() }) },
        )
        if (updated?.length) return NextResponse.json({ saved: true })
      }
      return NextResponse.json({ error: 'Chat changed while saving the voice transcript. Please try again.' }, { status: 409 })
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (title !== undefined) payload.title = title
    if (messages !== undefined) payload.messages = messages

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

    return NextResponse.json(updated[0])
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
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
