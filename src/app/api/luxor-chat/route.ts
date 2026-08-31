import { NextResponse } from 'next/server'
import { generatePublicElenaReply, type PublicElenaMessage } from '@/lib/luxorElenaServer'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { messages?: PublicElenaMessage[] }
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ reply: 'I can help you plan your event or check current private-tour times.', mode: 'fallback' })
    }

    const messages = body.messages
      .filter((message): message is PublicElenaMessage => (
        (message?.role === 'user' || message?.role === 'assistant')
        && typeof message.content === 'string'
        && Boolean(message.content.trim())
      ))
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 2000) }))

    return NextResponse.json(await generatePublicElenaReply(messages, 'published'))
  } catch (error) {
    console.error('Public Elena chat failed:', error)
    return NextResponse.json({
      reply: 'I want to make sure you receive accurate information. I can help you check current tour times, or the Luxor team can confirm the details.',
      mode: 'fallback',
    })
  }
}
