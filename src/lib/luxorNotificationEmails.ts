import 'server-only'

import crypto from 'crypto'
import { LuxorEmailJob, LuxorInquiry, LuxorTask } from './luxorInquiryTypes'
import { sendLuxorZohoEmail } from './zohoMailServer'
import { sendLuxorResendEmail } from './luxorResendMailServer'
import { luxorMailAddress, luxorMailProvider } from './luxorMailConfig'
import { supabaseRest, supabaseRestStrict } from './supabaseRestServer'
import { getAllowedZohoPortalEmails } from './luxorPortalAuth'

type InquirySnapshot = Pick<LuxorInquiry, 'id' | 'full_name' | 'email' | 'phone' | 'event_type' | 'guest_count' | 'budget'
  | 'target_date' | 'message' | 'source' | 'flow' | 'preferred_tour_date' | 'preferred_tour_time' | 'metadata'>

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'http://localhost:3000'

function absoluteUrl(path: string) {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Uses the Elena chat model (openai/gpt-4.1-mini via OpenRouter) to summarize
 * inquiry details, notes, and chat conversations.
 */
async function generateAiSummary(inquiry: InquirySnapshot): Promise<string> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) {
    return 'No AI summary generated (OpenRouter API key missing).'
  }

  // Compile inputs for prompt
  const name = inquiry.full_name
  const email = inquiry.email || 'N/A'
  const phone = inquiry.phone || 'N/A'
  const eventType = inquiry.event_type || 'N/A'
  const guestCount = inquiry.guest_count || 'N/A'
  const budget = inquiry.budget || 'N/A'
  const targetDate = inquiry.target_date || 'N/A'
  const notes = inquiry.message || ''
  
  const chatMessages = Array.isArray(inquiry.metadata?.chatMessages) ? inquiry.metadata.chatMessages : []
  const formattedChat = chatMessages
    .filter((m): m is { role: string; content: string } => Boolean(m) && typeof m === 'object' && typeof m.content === 'string')
    .slice(-40).map(m => `${m.role === 'user' ? 'Visitor' : 'Elena AI'}: ${m.content.slice(0, 2000)}`)
    .join('\n')

  const prompt = `You are Elena, the internal AI concierge for Luxor Event Space. Summarize this lead inquiry details for the internal booking team. Highlight what they are planning and synthesize the context from their notes and chat history with you. Keep the summary professional, actionable, and under 150 words.

Inquiry Details:
- Name: ${name}
- Email: ${email}
- Phone: ${phone}
- Event Type: ${eventType}
- Guest Count: ${guestCount}
- Planning Budget: ${budget}
- Target Date: ${targetDate}
- Visitor Notes: ${notes}

Chat History with Elena:
${formattedChat || 'No chat history.'}
`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://luxoreventspace.com',
        'X-Title': 'Luxor Event Space Notification Builder',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant summarizing event leads.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`Inquiry summary unavailable (HTTP ${response.status}).`)
      return 'AI Summary failed to generate.'
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content
    return typeof summary === 'string' ? summary.trim().slice(0, 3000) || 'No AI summary generated.' : 'No AI summary generated.'
  } catch {
    console.warn('Inquiry summary unavailable; sending the saved inquiry details.')
    return 'Error generating AI summary.'
  }
}

/**
 * Builds the branded HTML email content.
 */
function buildBrandedNotificationHtml(inquiry: InquirySnapshot, aiSummary: string): string {
  const leadUrl = absoluteUrl(`/portal/leads/${inquiry.id}`)
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>New Lead Inquiry - Luxor</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, p, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .luxor-bg { background-color: #050505 !important; color: #f7efe3 !important; }
      .luxor-card { background-color: #0a0807 !important; border-color: rgba(202,162,76,0.22) !important; }
      .luxor-header { background-color: #080605 !important; }
      .luxor-hero { background-color: #120d0a !important; }
      .luxor-box { background-color: #0b0a08 !important; }
      .luxor-title { color: #f7efe3 !important; }
      .luxor-gold { color: #caa24c !important; }
      .luxor-muted { color: #d7c29a !important; }
    }
    [data-ogsc] .luxor-bg { background-color: #050505 !important; }
    [data-ogsc] .luxor-card { background-color: #0a0807 !important; }
    [data-ogsc] .luxor-title { color: #f7efe3 !important; }
    [data-ogsc] .luxor-gold { color: #caa24c !important; }
  </style>
</head>
<body class="luxor-bg" style="margin:0;padding:0;background-color:#050505;font-family:'Helvetica Neue',Arial,sans-serif;color:#f7efe3;color-scheme:light dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" class="luxor-bg" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:100%;max-width:600px;table-layout:fixed;overflow-wrap:anywhere;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td class="luxor-header" style="padding:24px 32px 16px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p style="margin:4px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">Internal Notification</p>
            </td>
          </tr>
          <tr>
            <td class="luxor-hero" style="padding:32px 32px 20px;background-color:#120d0a;background:linear-gradient(180deg,#120d0a,#050505);">
              <p class="luxor-gold" style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">New Lead Submission</p>
              <h1 class="luxor-title" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:500;line-height:1.2;color:#f7efe3;">Inquiry from ${escapeHtml(inquiry.full_name)}</h1>
              
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" border="0" class="luxor-box" style="margin-top:20px;background-color:#0b0a08;border:1px solid rgba(202,162,76,0.12);border-radius:4px;font-size:13px;">
                <tr>
                  <td width="30%" class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Email</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.email || 'N/A')}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Phone</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.phone || 'N/A')}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Event Type</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.event_type || 'N/A')}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Guests</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${inquiry.guest_count || 'N/A'}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Planning Budget</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.budget || 'Not provided')}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Target Date</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.target_date || 'N/A')}</td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Source / Flow</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.source || 'website')} / ${escapeHtml(inquiry.flow || 'tour_request')}</td>
                </tr>
                ${inquiry.preferred_tour_date ? `
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Tour Date/Time</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">${escapeHtml(inquiry.preferred_tour_date)} at ${escapeHtml(inquiry.preferred_tour_time || 'N/A')}</td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="padding:0 32px 20px;">
              <div class="luxor-box" style="padding:20px;background-color:#0b0a08;border-left:3px solid #caa24c;border-radius:0 4px 4px 0;">
                <p class="luxor-gold" style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#caa24c;">Elena AI Summary</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(215,194,154,0.85);white-space:pre-wrap;">${escapeHtml(aiSummary)}</p>
              </div>
            </td>
          </tr>

          ${inquiry.message ? `
          <tr>
            <td style="padding:0 32px 20px;">
              <div class="luxor-box" style="padding:20px;background-color:#0d0b09;border:1px solid rgba(202,162,76,0.1);border-radius:4px;">
                <p class="luxor-gold" style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#caa24c;">Manual Notes / Message</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(215,194,154,0.75);">${escapeHtml(inquiry.message)}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <tr>
            <td align="center" style="padding:20px 32px 40px;">
              <a href="${leadUrl}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);">Open Portal Lead Dossier</a>
            </td>
          </tr>

          <tr>
            <td class="luxor-header" style="background-color:#080605;padding:24px;text-align:center;border-top:1px solid rgba(202,162,76,0.14);font-size:11px;color:rgba(215,194,154,0.4);">
              Luxor Event Space Owner Portal &bull; Internal Notification Alerts
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function formatTaskDueDate(dueDate?: string | null): string {
  if (!dueDate) return 'Not scheduled'
  try {
    const [year, month, day] = dueDate.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  } catch {
    return dueDate
  }
}

function formatTaskDueTime(dueAt?: string | null): string | null {
  if (!dueAt) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dueAt))
  } catch {
    return null
  }
}

const TASK_TYPE_LABELS: Record<string, string> = {
  todo: 'To-do',
  call: 'Phone Call',
  email: 'Email Follow-up',
  meeting: 'Meeting',
  other: 'Task',
}

/**
 * Builds branded Luxor HTML email for high-priority / urgent task alerts.
 */
export function buildHighPriorityTaskEmailHtml(task: LuxorTask, lead?: LuxorInquiry | null): string {
  const isUrgent = task.priority === 'urgent'
  const calendarUrl = absoluteUrl('/portal/calendar')
  const leadUrl = lead ? absoluteUrl(`/portal/leads/${lead.id}`) : null
  const formattedDueDate = formatTaskDueDate(task.due_date)
  const formattedDueTime = formatTaskDueTime(task.due_at)
  const taskTypeDisplay = TASK_TYPE_LABELS[task.task_type || ''] || 'To-do'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${isUrgent ? 'Urgent' : 'High Priority'} Task Alert - Luxor</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, p, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .luxor-bg { background-color: #050505 !important; color: #f7efe3 !important; }
      .luxor-card { background-color: #0a0807 !important; border-color: rgba(202,162,76,0.22) !important; }
      .luxor-header { background-color: #080605 !important; }
      .luxor-hero { background-color: #120d0a !important; }
      .luxor-box { background-color: #0b0a08 !important; }
      .luxor-title { color: #f7efe3 !important; }
      .luxor-gold { color: #caa24c !important; }
      .luxor-muted { color: #d7c29a !important; }
    }
    [data-ogsc] .luxor-bg { background-color: #050505 !important; }
    [data-ogsc] .luxor-card { background-color: #0a0807 !important; }
    [data-ogsc] .luxor-title { color: #f7efe3 !important; }
    [data-ogsc] .luxor-gold { color: #caa24c !important; }
  </style>
</head>
<body class="luxor-bg" style="margin:0;padding:0;background-color:#050505;font-family:'Helvetica Neue',Arial,sans-serif;color:#f7efe3;color-scheme:light dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" class="luxor-bg" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:100%;max-width:600px;table-layout:fixed;overflow-wrap:anywhere;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td class="luxor-header" style="padding:24px 32px 16px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p style="margin:4px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">Internal Notification</p>
            </td>
          </tr>
          <tr>
            <td class="luxor-hero" style="padding:32px 32px 20px;background-color:#120d0a;background:linear-gradient(180deg,#120d0a,#050505);">
              <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:${isUrgent ? '#ef4444' : '#caa24c'};">
                ${isUrgent ? '🔴 Urgent Priority Alert' : '⚠️ High Priority Alert'}
              </p>
              <h1 class="luxor-title" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:500;line-height:1.2;color:#f7efe3;">
                ${escapeHtml(task.title)}
              </h1>
              
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" border="0" class="luxor-box" style="margin-top:20px;background-color:#0b0a08;border:1px solid rgba(202,162,76,0.12);border-radius:4px;font-size:13px;">
                <tr>
                  <td width="32%" class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Priority</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    <span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background-color:${isUrgent ? 'rgba(239,68,68,0.18)' : 'rgba(217,119,6,0.18)'};color:${isUrgent ? '#f87171' : '#f59e0b'};border:1px solid ${isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(217,119,6,0.35)'};">
                      ${task.priority.toUpperCase()}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Due Date</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    ${formattedDueDate}${formattedDueTime ? ` at ${formattedDueTime} (Central)` : ''}
                  </td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Task Type</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    ${taskTypeDisplay}
                  </td>
                </tr>
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Assigned To</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    ${escapeHtml(task.assigned_to || 'Arianna Patterson')}
                  </td>
                </tr>
                ${lead ? `
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Linked Lead</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);font-weight:600;">
                    ${escapeHtml(lead.full_name)}
                  </td>
                </tr>
                ${lead.event_type ? `
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Event Type</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    ${escapeHtml(lead.event_type)}${lead.target_date ? ` &bull; Date: ${escapeHtml(lead.target_date)}` : ''}
                  </td>
                </tr>
                ` : ''}
                ${lead.phone ? `
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Phone</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    <a href="tel:${escapeHtml(lead.phone)}" style="color:#caa24c;text-decoration:none;">${escapeHtml(lead.phone)}</a>
                  </td>
                </tr>
                ` : ''}
                ${lead.email ? `
                <tr>
                  <td class="luxor-gold" style="color:#caa24c;font-weight:bold;border-bottom:1px solid rgba(202,162,76,0.06);">Email</td>
                  <td class="luxor-muted" style="color:#d7c29a;border-bottom:1px solid rgba(202,162,76,0.06);">
                    <a href="mailto:${escapeHtml(lead.email)}" style="color:#caa24c;text-decoration:none;">${escapeHtml(lead.email)}</a>
                  </td>
                </tr>
                ` : ''}
                ` : ''}
              </table>
            </td>
          </tr>

          ${task.description ? `
          <tr>
            <td style="padding:0 32px 20px;">
              <div class="luxor-box" style="padding:20px;background-color:#0b0a08;border-left:3px solid #caa24c;border-radius:0 4px 4px 0;">
                <p class="luxor-gold" style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#caa24c;">Task Notes / Context</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(215,194,154,0.85);white-space:pre-wrap;">${escapeHtml(task.description)}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <tr>
            <td align="center" style="padding:20px 32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 8px;">
                    <a href="${calendarUrl}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);">Open Calendar & Tasks</a>
                  </td>
                  ${leadUrl ? `
                  <td style="padding:0 8px;">
                    <a href="${leadUrl}" target="_blank" style="display:inline-block;background-color:transparent;color:#caa24c;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:3px;border:1px solid rgba(202,162,76,0.35);">View Lead Dossier</a>
                  </td>
                  ` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="luxor-header" style="background-color:#080605;padding:24px;text-align:center;border-top:1px solid rgba(202,162,76,0.14);font-size:11px;color:rgba(215,194,154,0.4);">
              Luxor Event Space Owner Portal &bull; Internal Notification Alerts
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Queues a high-priority task email alert into luxor_email_jobs with deduplication.
 */
export async function queueHighPriorityTaskAlert(
  task: LuxorTask,
  lead?: LuxorInquiry | null,
  recipientOverride?: string
): Promise<LuxorEmailJob | null> {
  if (!task || !['high', 'urgent'].includes(task.priority)) return null

  const allowedEmails = getAllowedZohoPortalEmails()
  const candidateEmail = (recipientOverride || task.assigned_to || '').trim().toLowerCase()
  const recipient = candidateEmail && allowedEmails.includes(candidateEmail)
    ? candidateEmail
    : 'a.patterson@luxoratlaspalmas.com'

  const isUrgent = task.priority === 'urgent'
  const subject = `${isUrgent ? '🔴 URGENT TASK' : '⚠️ HIGH PRIORITY TASK'}: ${task.title}${lead?.full_name ? ` (${lead.full_name})` : ''}`
  const body = buildHighPriorityTaskEmailHtml(task, lead)

  const hash = crypto
    .createHash('sha256')
    .update(`luxor-high-priority-task/v1/${task.id}/${task.priority}/${recipient}`)
    .digest('hex')
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`

  const rows = await supabaseRestStrict<LuxorEmailJob[]>('luxor_email_jobs?on_conflict=id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      id,
      job_type: 'inquiry_notification',
      status: 'queued',
      inquiry_id: task.inquiry_id || null,
      recipient_email: recipient,
      subject,
      body,
      scheduled_for: new Date().toISOString(),
      metadata: {
        notificationKind: 'high_priority_task',
        notificationRendered: true,
        notificationProvider: luxorMailProvider(),
        taskId: task.id,
        taskPriority: task.priority,
        leadId: lead?.id || null,
      },
    }),
  })

  return rows[0] || null
}

/** Build once before delivery so a retry uses the exact same provider payload. */
export async function deliverLuxorInquiryNotification(job: LuxorEmailJob): Promise<{ status: 'sent' | 'skipped' }> {
  if (job.job_type !== 'inquiry_notification' || job.status !== 'sending') throw new Error('Internal alert must be claimed before delivery.')
  const cancellationKind = job.metadata.notificationKind
  if (cancellationKind === 'staff_reminder') {
    const { sourceId, sourceKind, sourceDate, sourceTime, sourceName, leadId, leadName } = job.metadata
    if (job.inquiry_id !== null || job.recipient_email.toLowerCase() !== 'a.patterson@luxoratlaspalmas.com'
      || typeof sourceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)
      || typeof sourceName !== 'string' || (sourceDate !== null && typeof sourceDate !== 'string') || (sourceTime !== null && typeof sourceTime !== 'string')
      || (leadId !== null && (typeof leadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId))) || (leadName !== null && typeof leadName !== 'string')
      || job.metadata.notificationRendered !== true) throw new Error('Staff reminder identity is invalid.')
    if (sourceKind === 'task') {
      const [task] = await supabaseRestStrict<Array<{ title: string; status: string; due_date: string | null; due_at: string | null; inquiry_id: string | null }>>(`luxor_tasks?select=title,status,due_date,due_at,inquiry_id&id=eq.${encodeURIComponent(sourceId)}&limit=1`)
      if (!task || task.status !== 'pending' || task.title !== sourceName || task.due_date !== sourceDate || task.due_at !== sourceTime || task.inquiry_id !== leadId) return { status: 'skipped' }
      if (leadId) {
        const [lead] = await supabaseRestStrict<Array<{ full_name: string }>>(`luxor_inquiries?select=full_name&id=eq.${encodeURIComponent(leadId)}&limit=1`)
        if (!lead || lead.full_name !== leadName) return { status: 'skipped' }
      }
    } else if (sourceKind === 'promotion') {
      const [promotion] = await supabaseRestStrict<Array<{ name: string; active: boolean; expires_on: string | null }>>(`luxor_promotions?select=name,active,expires_on&id=eq.${encodeURIComponent(sourceId)}&limit=1`)
      if (!promotion || !promotion.active || promotion.name !== sourceName || promotion.expires_on !== sourceDate) return { status: 'skipped' }
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
      const part = (type: string) => parts.find(item => item.type === type)?.value
      if (typeof sourceDate !== 'string' || `${part('year')}-${part('month')}-${part('day')}` > sourceDate) return { status: 'skipped' }
    } else throw new Error('Staff reminder source is invalid.')
  }
  if (cancellationKind === 'tour_cancellation' || cancellationKind === 'tour_cancellation_client') {
    const inquiryId = job.metadata.tourInquiryId
    const eventId = job.metadata.calendarEventId
    const sequence = job.metadata.calendarSequence
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (job.inquiry_id !== null || typeof inquiryId !== 'string' || !uuid.test(inquiryId)
      || typeof eventId !== 'string' || !uuid.test(eventId) || typeof sequence !== 'string' || !/^\d+$/.test(sequence)
      || job.metadata.notificationRendered !== true || job.metadata.notificationProvider !== 'resend') {
      throw new Error('Tour cancellation alert is missing its saved identity.')
    }
    const [inquiries, events] = await Promise.all([
      supabaseRest<Array<{ is_test: boolean; tour_attendance_status: string | null; email: string | null }>>(`luxor_inquiries?select=is_test,tour_attendance_status,email&id=eq.${encodeURIComponent(inquiryId)}&limit=1`),
      supabaseRest<Array<{ id: string; sequence: number; status: string; state: { attendeeEmails?: unknown } | null }>>(`luxor_calendar_events?select=id,sequence,status,state&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`),
    ])
    const event = events[0]
    const inquiry = inquiries[0]
    if (!inquiry || inquiry.is_test || inquiry.tour_attendance_status !== 'cancelled' || !event || event.id !== eventId
      || event.status !== 'cancelled' || String(event.sequence) !== sequence
      || !Array.isArray(event.state?.attendeeEmails)) return { status: 'skipped' }
    const recipient = luxorMailAddress(job.recipient_email)
    const client = luxorMailAddress(inquiry.email || '')
    const attendees = event.state.attendeeEmails.map((value: unknown) => typeof value === 'string' ? luxorMailAddress(value) : '')
    // Client notices target only the current inquiry email. An admin alert
    // must never reach the client or someone already receiving calendar mail.
    if (!recipient || attendees.includes(recipient)
      || (cancellationKind === 'tour_cancellation_client' ? !client || recipient !== client : recipient === client)) {
      return { status: 'skipped' }
    }
  }
  if (cancellationKind === 'high_priority_task') {
    const taskId = job.metadata.taskId
    if (typeof taskId === 'string') {
      const [task] = await supabaseRestStrict<Array<{ status: string; priority: string }>>(`luxor_tasks?select=status,priority&id=eq.${encodeURIComponent(taskId)}&limit=1`)
      if (!task || task.status !== 'pending' || !['high', 'urgent'].includes(task.priority)) return { status: 'skipped' }
    }
  }
  let frozen = job
  if (job.metadata.notificationRendered !== true) {
    const snapshot = job.metadata.inquirySnapshot as InquirySnapshot | undefined
    if (!snapshot || snapshot.id !== job.inquiry_id || typeof snapshot.full_name !== 'string') {
      throw new Error('Internal alert is missing its saved inquiry snapshot.')
    }
    const summary = await generateAiSummary(snapshot)
    const html = buildBrandedNotificationHtml(snapshot, summary)
    const rows = await supabaseRest<LuxorEmailJob[]>(
      `luxor_email_jobs?select=*&id=eq.${job.id}&status=eq.sending&attempts=eq.${job.attempts}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        body: html, updated_at: new Date().toISOString(),
        metadata: { ...job.metadata, notificationRendered: true, notificationProvider: luxorMailProvider() },
      }) },
    )
    if (!rows[0]) throw new Error('Internal alert claim changed before content was saved.')
    frozen = rows[0]
  }
  const provider = frozen.metadata.notificationProvider
  if (provider !== 'resend' && provider !== 'zoho') throw new Error('Internal alert is missing its saved delivery provider.')
  if (provider === 'zoho' && luxorMailProvider() !== 'zoho') {
    throw new Error('Review the unfinished Zoho alert before switching its delivery provider.')
  }
  const send = provider === 'resend' ? sendLuxorResendEmail : sendLuxorZohoEmail
  await send({
    to: frozen.recipient_email, subject: frozen.subject, content: frozen.body,
    from: 'booking@luxoratlaspalmas.com', fromName: cancellationKind === 'staff_reminder' ? 'Luxor Reminders' : cancellationKind === 'high_priority_task' ? 'Luxor Tasks' : cancellationKind === 'tour_cancellation_client' ? 'Luxor Event Space' : 'Luxor Lead Alerts',
    idempotencyKey: `email-job/${frozen.id}`,
  })
  return { status: 'sent' }
}
