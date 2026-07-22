import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

interface ChatMessage {
  role: MessageRole
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: Record<string, unknown>[]
  executedQueries?: Record<string, unknown>[]
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
      return NextResponse.json(chats[0])
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

    const defaultMsg: ChatMessage[] = [
      {
        role: 'assistant',
        content: "Elena AI Concierge active. Connected to your live Luxor database & CRM. How can I assist with your venue operations, lead intelligence, or analytics today?"
      }
    ]

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

    const { id, title, messages } = (await request.json()) as {
      id?: string
      title?: string
      messages?: ChatMessage[]
    }

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
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
