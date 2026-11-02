import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { buildElenaReplyContext, getLuxorEmailThreadContext } from '@/lib/luxorEmailThreadContextServer'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'

function ensureSenderSignOff(draft: string, senderFirstName: string): string {
  const trimmed = draft.trim()
  if (!trimmed) return trimmed

  const normalizedEnd = trimmed.slice(-60).toLowerCase()
  if (normalizedEnd.includes(senderFirstName.toLowerCase())) {
    return trimmed
  }

  if (/(?:thanks|warmly|best|cheers|sincerely|regards|thank you)[,!]?\s*$/i.test(trimmed)) {
    return `${trimmed}\n${senderFirstName}`
  }

  return `${trimmed}\n\nThanks,\n${senderFirstName}`
}

async function resolveSenderFirstName(email: string): Promise<string> {
  try {
    const member = await getLuxorPortalMember(email)
    if (member?.display_name?.trim()) {
      return member.display_name.trim().split(/\s+/)[0]
    }
  } catch {
    /* ignore */
  }
  try {
    const profile = await getLuxorUserProfile(email)
    if (profile?.displayName?.trim() && !profile.displayName.toLowerCase().includes('luxor team')) {
      return profile.displayName.trim().split(/\s+/)[0]
    }
  } catch {
    /* ignore */
  }
  return 'Arianna'
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Missing OpenRouter API key.' }, { status: 500 })
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { instruction?: string; senderFirstName?: string }
    const senderFirstName = body.senderFirstName?.trim() || (await resolveSenderFirstName(session.email))

    const context = await getLuxorEmailThreadContext(id)
    if (!context.messages.length) return NextResponse.json({ error: 'This conversation has no messages to draft from.' }, { status: 404 })
    const prepared = buildElenaReplyContext(context)
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
        'X-Title': 'Luxor Elena Thread Reply',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: `You are Elena, the warm, capable booking coordinator for Luxor Event Space in San Antonio. Draft a concise reply to the latest client email. The EMAIL CHAIN is the primary source of truth. Use client records and notes only as supporting context. Never invent availability, pricing, promises, dates, payments, or policies. If a necessary fact is missing, ask a natural question. Do not repeat questions already answered in the chain. Always sign off warmly at the end of the email on its own lines with "Thanks," followed by "${senderFirstName}" (e.g.:\n\nThanks,\n${senderFirstName}). Return only the ready-to-send email body in plain text, with no subject line, labels, analysis, or markdown headers.`,
          },
          {
            role: 'user',
            content: `OWNER INSTRUCTION\n${String(body.instruction || 'Reply helpfully and move the booking conversation forward.').slice(0, 2000)}\n\nEMAIL CHAIN (PRIMARY SOURCE)\n${prepared.chain}\n\nCLIENT RECORD\n${prepared.client}\n\nINTERNAL NOTES\n${prepared.notes}\n\nBOOKINGS\n${prepared.bookings}`,
          },
        ],
      }),
    })
    const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(data.error?.message || `OpenRouter request failed with ${response.status}.`)
    const rawDraft = String(data.choices?.[0]?.message?.content || '').trim()
    if (!rawDraft) throw new Error('Elena returned an empty draft.')
    const draft = ensureSenderSignOff(rawDraft, senderFirstName)
    return NextResponse.json({ draft, model: 'google/gemini-2.5-flash', senderFirstName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Elena could not draft this reply.'
    console.error('Elena thread reply failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
