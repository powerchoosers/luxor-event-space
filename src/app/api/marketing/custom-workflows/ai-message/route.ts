import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = (await request.json()) as {
      channel: 'email' | 'text'
      prompt: string
      leadContext?: {
        firstName?: string
        eventType?: string
        guestCount?: number | string
        targetDate?: string
      }
    }

    const { channel, prompt, leadContext } = payload
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Please provide instructions for the message copy.' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (apiKey) {
      try {
        const systemPrompt = channel === 'text'
          ? `You are Elena writing an SMS text message on behalf of Arianna Patterson at Luxor Event Space.
Luxor text messages MUST:
1. Start with "Luxor Events: "
2. End with "Reply STOP to opt out."
3. Be under 320 characters.
4. Sound warm, luxurious, human, and concise.
5. Use dynamic variables like {{first_name}}, {{event_type}} where relevant.
Return ONLY the final text message string, nothing else.`
          : `You are Elena writing an email on behalf of Luxor Event Space (luxury event venue in Mission, TX).
Tone: warm, hospitable, refined, polished, clear.
Dynamic variables available: {{first_name}}, {{event_type}}, {{guest_count}}, {{target_date}}, {{tour_date}}, {{tour_time}}.
Return ONLY a valid JSON object with:
{
  "subject": "Compelling, warm subject line",
  "previewText": "Short 1-line preview snippet",
  "body": "Formatted email body text with natural paragraphs",
  "ctaText": "Button CTA label"
}`

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://luxoratlaspalmas.com',
            'X-Title': 'Luxor Elena Message Writer',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.3,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: JSON.stringify({ prompt, leadContext: leadContext || {} }) },
            ],
          }),
          signal: AbortSignal.timeout(14_000),
        })

        if (response.ok) {
          const completion = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>
          }
          const raw = completion.choices?.[0]?.message?.content?.trim()
          if (raw) {
            if (channel === 'text') {
              return NextResponse.json({ body: raw })
            } else {
              try {
                const parsed = JSON.parse(raw.replace(/^```json/, '').replace(/```$/, '').trim())
                return NextResponse.json(parsed)
              } catch {
                return NextResponse.json({
                  subject: 'Regarding your Luxor event',
                  previewText: 'A personalized note from Luxor Event Space',
                  body: raw,
                  ctaText: 'Schedule a Tour',
                })
              }
            }
          }
        }
      } catch (err) {
        console.warn('AI Message generation failed, falling back:', err)
      }
    }

    // Graceful fallback
    if (channel === 'text') {
      return NextResponse.json({
        body: `Luxor Events: Hi {{first_name}}! Arianna here from Luxor. We would love to help you plan your {{event_type}}. Do you have time for a quick tour this week? Reply STOP to opt out.`,
      })
    } else {
      return NextResponse.json({
        subject: 'Planning your {{event_type}} at Luxor',
        previewText: 'We would love to welcome you for a private walkthrough.',
        body: 'Dear {{first_name}},\n\nThank you for considering Luxor Event Space for your {{event_type}}.\n\nOur grand ballroom and garden amenities are designed to create unforgettable celebrations for up to {{guest_count}} guests. We would be honored to show you our space in person.\n\nPlease let us know what days work best for your schedule.',
        ctaText: 'Schedule a Tour',
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Message generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
