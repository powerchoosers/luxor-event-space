import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    interface LeadContextData {
      full_name?: string
      event_type?: string
      target_date?: string
      guest_count?: number | string
    }

    const { prompt, tone, leadContext } = (await request.json()) as { 
      prompt?: string
      tone?: string
      leadContext?: LeadContextData
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OpenRouter API key' }, { status: 500 })
    }

    // Prepare tone instruction
    let tonePrompt = 'friendly, warm, and conversational'
    if (tone === 'professional') {
      tonePrompt = 'corporate, respectful, clear, and professional'
    } else if (tone === 'urgent') {
      tonePrompt = 'urgent, highlighting scarce dates, creating high FOMO to prompt immediate bookings'
    } else if (tone === 'elegant') {
      tonePrompt = 'sophisticated, high-end, luxurious, and elegant'
    }

    // Prepare lead context instruction
    let leadPrompt = ''
    if (leadContext) {
      leadPrompt = `This email is a direct, personalized follow-up to a lead in our database:
- Client Name: ${leadContext.full_name || 'Valued Guest'}
- Event Type: ${leadContext.event_type || 'celebration'}
- Event Date: ${leadContext.target_date || 'requested date'}
- Guest Count: ${leadContext.guest_count || 'open'}
Use this context to draft a tailored marketing/follow-up email. You can weave these details directly into the copy.`
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://luxoreventspace.com',
        'X-Title': 'Luxor Event Space Email Draft Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are Elena, the marketing coordinator and email copywriter for Luxor Event Space in San Antonio.
Your task is to write a highly professional, beautifully copy-crafted marketing email draft based on the user's prompt instruction.

You MUST respond ONLY with a valid JSON object containing exactly three keys:
1. "subject": A catchy, professional email subject line.
2. "name": A clean name for this generated template.
3. "blocks": An array of content blocks (max 5 blocks) representing the layout structure of the email.

Each block in the "blocks" array MUST match one of the following JSON structures:

- Hero Block:
{
  "type": "hero",
  "headline": "Main Hero Headline",
  "subheadline": "Hero subheadline description text",
  "backgroundImage": "",
  "overlayOpacity": 0.55,
  "textAlign": "center",
  "ctaLabel": "Action Label",
  "ctaUrl": "https://luxoratlaspalmas.com/tour",
  "ctaVisible": true
}

- Text Block:
{
  "type": "text",
  "content": "Paragraph content copy. Use \\n\\n for paragraph breaks.",
  "fontSize": 15,
  "textAlign": "left",
  "color": "rgba(255, 255, 255, 0.85)"
}

- Button Block:
{
  "type": "button",
  "label": "Button Label",
  "url": "https://luxoratlaspalmas.com/visit",
  "align": "center",
  "bgColor": "#caa24c",
  "textColor": "#050505"
}

- Two Column Block:
{
  "type": "two_column",
  "leftHeadline": "Left column title",
  "leftBody": "Left column body copy text",
  "rightHeadline": "Right column title",
  "rightBody": "Right column body copy text"
}

- Divider Block:
{
  "type": "divider",
  "color": "#caa24c",
  "thickness": 1,
  "style": "solid"
}

- Spacer Block:
{
  "type": "spacer",
  "height": 24
}

Guidelines for generating blocks:
- Use Client Merge Tags: You are encouraged to include merge tags like {{client_name}}, {{event_type}}, {{event_date}}, or {{tour_time}} inside text and hero blocks where appropriate to make the template dynamic.
- Tone of Voice: You must write the email copywriting using a ${tonePrompt} tone.
- Keep the design clean, elegant, and focused. A standard layout begins with a 'hero' block, followed by a 'text' block explaining the details, a 'button' CTA block, and perhaps a 'divider' or 'two_column' section. Do not add a 'footer' block as the system appends it automatically.

JSON output structure:
{
  "subject": "Catchy Subject",
  "name": "Template Name",
  "blocks": [
    { "type": "hero", "headline": "Celebrate at Luxor", "subheadline": "Your milestone event awaits.", "backgroundImage": "", "overlayOpacity": 0.6, "textAlign": "center", "ctaLabel": "Book Tour", "ctaUrl": "https://luxoratlaspalmas.com/tour", "ctaVisible": true },
    { "type": "text", "content": "We would love to host your next celebration.", "fontSize": 15, "textAlign": "left", "color": "rgba(255, 255, 255, 0.85)" }
  ]
}

Do not include any markdown block formatting, backticks, or text before or after the JSON.`
          },
          {
            role: 'user',
            content: `Draft an email campaign for: ${prompt}.
${leadPrompt}`
          }
        ]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Failed to call OpenRouter:', errText)
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
    }

    const data = await response.json()
    let responseText = data.choices?.[0]?.message?.content || ''
    
    // Clean codeblock formatting if returned
    if (responseText.includes('```')) {
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
    }

    try {
      const emailContent = JSON.parse(responseText) as {
        subject: string
        name: string
        blocks: Record<string, unknown>[]
      }
      return NextResponse.json(emailContent)
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', responseText, parseErr)
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('Generate Email API error:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
