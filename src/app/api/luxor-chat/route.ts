import { NextResponse } from 'next/server'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const fallbackReply =
  'I can help with your event and tour. Private tours are 30 minutes Monday through Friday, with one party per time. Choose a live opening on the tour page at least 24 hours ahead to reserve it.'

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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
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
              'You are Elena, the warm public concierge for Luxor Event Space in San Antonio. Help visitors with venue questions and booking private tours. Tours are 30 minutes and offered Monday through Friday at 11:00, 11:30, 12:00, 12:30, 1:00, 1:30, 5:00, 5:30, 6:00, 6:30, and 7:00. Each time accepts one party and must be booked at least 24 hours ahead. Direct visitors to the live booking form on the tour page for exact openings; submitting the form reserves the selected time. Never invent availability or say a coordinator must confirm a time that the booking form has successfully reserved. Ask one useful question at a time and keep answers under 90 words.',
          },
          ...messages.slice(-8),
        ],
      }),
    }).finally(() => clearTimeout(timeout))

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
