import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LUXOR_UNSLOP_COPY_RULES } from '@/lib/luxorUnslop'
import type {
  LeadNoteContextPayload,
  LeadNoteType,
  NoteSlashCommandKey,
} from '@/lib/luxorNoteAiTypes'

export const runtime = 'nodejs'

const COMMAND_CONFIG: Record<
  NoteSlashCommandKey,
  {
    noteType: LeadNoteType
    title: string
    instruction: string
  }
> = {
  call: {
    noteType: 'call_log',
    title: 'Call Recap',
    instruction:
      'Summarize the most recent call transcript(s), call summaries, and call notes. Highlight what the client asked or shared, key preferences, outcome, and concrete next steps. If no call transcript exists yet, note the latest call status and context from recent messages.',
  },
  followup: {
    noteType: 'email_log',
    title: 'Follow-Up Log',
    instruction:
      'Summarize the recent email and SMS text touchpoints with this lead, client responsiveness, pending questions, and what follow-up was sent or is recommended next.',
  },
  tour: {
    noteType: 'note',
    title: 'Tour & Event Brief',
    instruction:
      'Draft a concise Tour & Event Brief covering tour date/time and status, event type, target event date, estimated guest count, package interest, and any special requests mentioned in notes, messages, or calls.',
  },
  summary: {
    noteType: 'note',
    title: 'Account Summary',
    instruction:
      'Write a tight executive Account Summary synthesizing the client profile, current stage, key points from calls/transcripts, emails, texts, previous notes, and overall status.',
  },
  'next-steps': {
    noteType: 'note',
    title: 'Next Steps',
    instruction:
      'List open follow-up tasks, unresolved client questions from emails/texts/calls, and clear recommended next actions to move this account forward.',
  },
}

function isValidCommand(value: unknown): value is NoteSlashCommandKey {
  return (
    value === 'call' ||
    value === 'followup' ||
    value === 'tour' ||
    value === 'summary' ||
    value === 'next-steps'
  )
}

function normalizeNoteBullets(text: string): string {
  return text.replace(/^(\s*)[-*]\s+/gm, '$1• ')
}

function buildFallbackNote(
  command: NoteSlashCommandKey,
  customInstruction: string,
  context: LeadNoteContextPayload
): string {
  const { lead, calls = [], notes = [], emails = [], texts = [], tasks = [] } = context
  const lines: string[] = []
  const leadLabel = lead.fullName || 'Contact'

  const eventSummary = [
    lead.eventType,
    lead.targetDate ? `Target date: ${lead.targetDate}` : null,
    lead.guestCount ? `${lead.guestCount} guests` : null,
    lead.packageInterest ? `Package: ${lead.packageInterest}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (command === 'call') {
    const latestCall = calls[0]
    lines.push(`Call Recap — ${leadLabel}`)
    if (latestCall) {
      lines.push(
        `• Call: ${latestCall.direction || 'call'} (${latestCall.status || 'logged'})${
          latestCall.duration ? `, ${latestCall.duration}s` : ''
        }`
      )
      if (latestCall.summary) lines.push(`• Summary: ${latestCall.summary.trim()}`)
      if (latestCall.notes) lines.push(`• Call notes: ${latestCall.notes.trim()}`)
      if (latestCall.transcript) {
        const excerpt = latestCall.transcript.trim().slice(0, 400)
        lines.push(`• Transcript highlights: ${excerpt}${latestCall.transcript.trim().length > 400 ? '…' : ''}`)
      }
    } else {
      lines.push('• No recorded call transcript on file yet.')
    }
    const openTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
    if (openTasks.length > 0) {
      lines.push(`• Next step: ${openTasks[0].title}${openTasks[0].dueDate ? ` (due ${openTasks[0].dueDate})` : ''}`)
    } else {
      lines.push('• Next step: Confirm follow-up action based on call outcome.')
    }
  } else if (command === 'followup') {
    lines.push(`Follow-Up Log — ${leadLabel}`)
    if (emails.length > 0) {
      const latestEmail = emails[0]
      lines.push(`• Latest email: "${latestEmail.subject || 'No subject'}"${latestEmail.snippet ? ` — ${latestEmail.snippet.trim().slice(0, 180)}` : ''}`)
    }
    if (texts.length > 0) {
      const latestText = texts[0]
      lines.push(`• Latest SMS (${latestText.direction || 'message'}): "${(latestText.body || '').trim().slice(0, 180)}"`)
    }
    if (emails.length === 0 && texts.length === 0) {
      lines.push('• No recent email or SMS touchpoints captured.')
    }
    if (eventSummary) lines.push(`• Event context: ${eventSummary}`)
  } else if (command === 'tour') {
    lines.push(`Tour & Event Brief — ${leadLabel}`)
    if (lead.preferredTourDate || lead.preferredTourTime) {
      lines.push(
        `• Tour: ${[lead.preferredTourDate, lead.preferredTourTime].filter(Boolean).join(' at ')}`
      )
    }
    if (eventSummary) lines.push(`• Event details: ${eventSummary}`)
    if (lead.pipelineStage || lead.status) {
      lines.push(`• Stage: ${lead.pipelineStage || lead.status}`)
    }
    if (lead.message) {
      lines.push(`• Initial inquiry message: ${lead.message.trim().slice(0, 220)}`)
    }
  } else if (command === 'next-steps') {
    lines.push(`Next Steps — ${leadLabel}`)
    const openTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
    if (openTasks.length > 0) {
      openTasks.slice(0, 4).forEach((task) => {
        lines.push(`• [Open] ${task.title}${task.dueDate ? ` (due ${task.dueDate})` : ''}`)
      })
    } else {
      lines.push(`• Current stage: ${lead.pipelineStage || lead.status || 'Active'}`)
      if (calls[0]?.summary) lines.push(`• Latest call context: ${calls[0].summary.trim().slice(0, 160)}`)
      if (emails[0]?.subject) lines.push(`• Latest email: ${emails[0].subject}`)
      lines.push('• Follow up with client to confirm next milestone.')
    }
  } else {
    // summary
    lines.push(`Account Summary — ${leadLabel}`)
    if (eventSummary) lines.push(`• Profile: ${eventSummary}`)
    if (lead.pipelineStage || lead.status) {
      lines.push(`• Status / Stage: ${lead.pipelineStage || lead.status}`)
    }
    if (calls[0]?.summary || calls[0]?.transcript) {
      lines.push(
        `• Recent call: ${(calls[0].summary || calls[0].transcript || '').trim().slice(0, 200)}`
      )
    }
    if (emails[0]?.subject) {
      lines.push(`• Recent email: "${emails[0].subject}"`)
    }
    if (texts[0]?.body) {
      lines.push(`• Recent SMS: "${texts[0].body.trim().slice(0, 140)}"`)
    }
    if (notes[0]?.content) {
      lines.push(`• Latest note: ${notes[0].content.trim().slice(0, 180)}`)
    }
  }

  if (customInstruction.trim()) {
    lines.push(`• Focus: ${customInstruction.trim()}`)
  }

  return normalizeNoteBullets(lines.join('\n'))
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      command?: unknown
      customInstruction?: unknown
      context?: LeadNoteContextPayload
    }

    if (!isValidCommand(body.command)) {
      return NextResponse.json({ error: 'Invalid note command.' }, { status: 400 })
    }

    const command = body.command
    const config = COMMAND_CONFIG[command]
    const customInstruction =
      typeof body.customInstruction === 'string' ? body.customInstruction.trim().slice(0, 500) : ''
    const context: LeadNoteContextPayload = body.context?.lead
      ? body.context
      : { lead: { id: '', fullName: 'Contact' } }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        note: buildFallbackNote(command, customInstruction, context),
        noteType: config.noteType,
      })
    }

    const trimmedContext = {
      lead: context.lead,
      calls: (context.calls || []).slice(0, 5).map((c) => ({
        ...c,
        transcript: c.transcript ? c.transcript.slice(0, 3000) : null,
        summary: c.summary ? c.summary.slice(0, 1000) : null,
        notes: c.notes ? c.notes.slice(0, 800) : null,
      })),
      notes: (context.notes || []).slice(0, 8).map((n) => ({
        ...n,
        content: n.content ? n.content.slice(0, 600) : '',
      })),
      emails: (context.emails || []).slice(0, 6).map((e) => ({
        ...e,
        snippet: e.snippet ? e.snippet.slice(0, 600) : '',
      })),
      texts: (context.texts || []).slice(0, 8).map((t) => ({
        ...t,
        body: t.body ? t.body.slice(0, 400) : '',
      })),
      tasks: (context.tasks || []).slice(0, 8),
    }

    const systemPrompt = `You are drafting a concise, factual internal CRM note for the owner of Luxor at Las Palmas Events in San Antonio.
Requested template (${config.title}): ${config.instruction}
Formatting rules:
- Write plain text ready to save directly into an account note field (no markdown code fences, no bold **stars**, no generic assistant preamble like "Here is your note:").
- Use short scannable lines or bullet points (•) instead of hyphen dashes (-) where helpful so the owner can read it in seconds.
- Keep it under 180 words unless rich transcript details justify up to 240 words.
- ${LUXOR_UNSLOP_COPY_RULES}
- Only state facts directly supported by the provided account context. If a source (such as call transcript or email history) has no entries or is empty, briefly note what is missing rather than inventing anything.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)
    const onAbort = () => controller.abort()
    request.signal.addEventListener('abort', onAbort, { once: true })

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
          'X-Title': 'Luxor Owner Portal Quick Note AI',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.25,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                command,
                extraDirection: customInstruction || null,
                accountContext: trimmedContext,
              }),
            },
          ],
        }),
      })

      if (!response.ok) {
        return NextResponse.json({
          note: buildFallbackNote(command, customInstruction, context),
          noteType: config.noteType,
        })
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const generated = payload.choices?.[0]?.message?.content?.trim()
      if (!generated) {
        return NextResponse.json({
          note: buildFallbackNote(command, customInstruction, context),
          noteType: config.noteType,
        })
      }

      return NextResponse.json({
        note: normalizeNoteBullets(generated),
        noteType: config.noteType,
      })
    } finally {
      clearTimeout(timeoutId)
      request.signal.removeEventListener('abort', onAbort)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Note generation cancelled.' }, { status: 499 })
    }
    console.error('Error generating AI note:', error)
    return NextResponse.json({ error: 'Unable to generate note.' }, { status: 500 })
  }
}
