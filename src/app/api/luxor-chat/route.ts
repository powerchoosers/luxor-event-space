import { NextResponse } from 'next/server'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const INDOOR_ONLY_REPLY =
  'Luxor is fully indoors—our main hall and Luxor Lounge are never weather-dependent. We don’t have an outdoor space, patio, courtyard, garden, or terrace. If the indoor layout could work for you, I can help you reserve a private tour.'

const fallbackReply =
  'I can help you plan your event or reserve a private tour. Tours are 30 minutes, and the live booking card shows the current openings.'

const venueSettingQuestionPattern = /\b(indoor|indoors|outdoor|outdoors|outside|open[-\s]?air|interior|exterior|patio|courtyard|garden|terrace|yard|backyard|porch|deck|rooftop|balcony)\b/i
const outdoorVenueReferencePattern = /\b(outdoor|outdoors|outside|open[-\s]?air|patio|courtyard|garden|terrace|yard|backyard|porch|deck|rooftop|balcony)\b/i

function latestVisitorMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
}

function requiresIndoorOnlyReply(messages: ChatMessage[]) {
  return venueSettingQuestionPattern.test(latestVisitorMessage(messages))
}

function keepVenueFactsAccurate(reply: string) {
  return outdoorVenueReferencePattern.test(reply) ? INDOOR_ONLY_REPLY : reply
}

const SYSTEM_PROMPT = `You are Elena, the warm public concierge for Luxor Event Space in San Antonio.

Verified venue facts:
- Luxor is one single indoor-only event venue.
- Luxor has no outdoor event space, patio, courtyard, garden, terrace, or open-air option.
- Never ask a visitor whether they prefer an indoor or outdoor setting. Never describe, imply, or suggest an outdoor option.
- If asked about an outdoor setting, say: "Luxor is fully indoors—our main hall and Luxor Lounge are never weather-dependent. We don’t have an outdoor space, patio, courtyard, garden, or terrace. If the indoor layout could work for you, I can help you reserve a private tour."

Your goal is to help a visitor confidently take the next step without overwhelming them:
- Keep each answer to one or two short sentences and normally under 55 words.
- Ask at most one useful question at a time. Do not repeat a question the visitor already answered.
- For a tour, tell them to use the live booking card to choose a time and add their name and phone; do not make them type all booking details into chat.
- Tours are 30 minutes, Monday through Friday, with one party per time and at least 24 hours ahead. The live booking card shows exact openings, and submitting it reserves the selected time.
- Never invent availability, pricing, features, services, policies, or confirmation steps. Direct visitors to the relevant site page when an exact answer is not available.`

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: ChatMessage[] }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ reply: fallbackReply }, { status: 200 })
    }

    if (requiresIndoorOnlyReply(messages)) {
      return NextResponse.json({ reply: INDOOR_ONLY_REPLY }, { status: 200 })
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
        temperature: 0.35,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
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
      reply: keepVenueFactsAccurate(data.choices?.[0]?.message?.content?.trim() || fallbackReply),
    })
  } catch {
    return NextResponse.json({ reply: fallbackReply, mode: 'fallback' }, { status: 200 })
  }
}
