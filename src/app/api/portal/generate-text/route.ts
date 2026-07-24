import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Elena AI is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json() as {
      prompt?: unknown
      audienceLabel?: unknown
      exampleRecipient?: unknown
    }
    const prompt = String(body.prompt || '').trim()
    if (!prompt) {
      return NextResponse.json({ error: 'Tell Elena what the text should accomplish.' }, { status: 400 })
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
        'X-Title': 'Luxor Elena Text Campaign Draft',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are Elena, the internal messaging coordinator for Luxor Event Space in San Antonio.
Draft a customer-care or transactional SMS campaign, never an unsolicited promotion.
Return strict JSON with keys: name, bodyTemplate, campaignType.
bodyTemplate must be 320 characters or fewer, identify "Luxor Event Space", and end with "Reply STOP to opt out."
Allowed merge fields are [FirstName], [FullName], [EventType], [EventDate], [TourDate], and [TourTime].
campaignType must be one of customer_care, transactional, tour, event, payment, invoice, or elena.
Do not invent dates, prices, balances, availability, links, or promises.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: prompt,
              audience: typeof body.audienceLabel === 'string' ? body.audienceLabel : 'Opted-in Luxor contacts',
              exampleRecipient: body.exampleRecipient || null,
            }),
          },
        ],
      }),
    })
    if (!response.ok) throw new Error('Elena could not generate the text draft.')
    const payload = await response.json()
    const raw = payload.choices?.[0]?.message?.content
    const draft = JSON.parse(typeof raw === 'string' ? raw : '{}') as {
      name?: unknown
      bodyTemplate?: unknown
      campaignType?: unknown
    }
    const text = String(draft.bodyTemplate || '').trim()
    if (!text) throw new Error('Elena returned an empty text draft.')
    return NextResponse.json({
      name: String(draft.name || 'Elena text campaign').slice(0, 160),
      bodyTemplate: text.slice(0, 480),
      campaignType: String(draft.campaignType || 'elena'),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Elena could not generate the text draft.' },
      { status: 500 },
    )
  }
}
