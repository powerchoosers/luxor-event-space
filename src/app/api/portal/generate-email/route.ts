import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prompt } = (await request.json()) as { prompt?: string }
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OpenRouter API key' }, { status: 500 })
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
2. "headline": A strong headline for the email hero banner (max 8 words).
3. "body": The copy-written email content body. Write a real, polished email draft text, using friendly and premium marketing language. Do NOT use placeholder text or instructions; write the full email copy. Use double newlines for paragraph breaks. Keep the body text under 200 words.

JSON output structure:
{
  "subject": "Email Subject Line Here",
  "headline": "Hero Banner Headline",
  "body": "Hi there,\\n\\nFirst paragraph text...\\n\\nSecond paragraph text..."
}

Do not include any markdown block formatting, backticks, or text before or after the JSON.`
          },
          {
            role: 'user',
            content: `Draft an email for: ${prompt}`
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
        headline: string
        body: string
      }
      return NextResponse.json(emailContent)
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', responseText, parseErr)
      // Fallback
      return NextResponse.json({
        subject: 'Welcome to Luxor Event Space',
        headline: 'Welcome to Luxor',
        body: prompt
      })
    }
  } catch (err: unknown) {
    console.error('Generate Email API error:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
