import { NextResponse } from 'next/server'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const fallbackReply =
  'I can help you choose an event style, compare dates, and request a private tour. Tell me what you are planning and about how many guests you expect.'

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: ChatMessage[] }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ reply: fallbackReply }, { status: 200 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY

    if (!apiKey) {
      return NextResponse.json({ reply: fallbackReply, mode: 'fallback' }, { status: 200 })
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://luxoreventspace.com',
        'X-Title': 'Luxor Event Space Concierge',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        temperature: 0.7,
        max_tokens: 260,
        messages: [
          {
            role: 'system',
            content:
              'You are Elena, the warm concierge for Luxor Event Space in San Antonio. Help visitors book private venue tours. Ask one useful question at a time. Recommend event styles, guest flow, photo moments, and tour next steps. Keep answers under 90 words. Do not promise exact availability; say a coordinator confirms final availability.',
          },
          ...messages.slice(-8),
        ],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ reply: fallbackReply, mode: 'fallback' }, { status: 200 })
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    return NextResponse.json({
      reply: data.choices?.[0]?.message?.content?.trim() || fallbackReply,
    })
  } catch {
    return NextResponse.json({ reply: fallbackReply, mode: 'fallback' }, { status: 200 })
  }
}
