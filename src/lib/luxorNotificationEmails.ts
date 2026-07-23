import 'server-only'

import { LuxorInquiry } from './luxorInquiryTypes'
import { sendLuxorZohoEmail } from './zohoMailServer'
import { supabaseRest } from './supabaseRestServer'

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
async function generateAiSummary(inquiry: LuxorInquiry): Promise<string> {
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
  const targetDate = inquiry.target_date || 'N/A'
  const notes = inquiry.message || ''
  
  const chatMessages = (inquiry.metadata?.chatMessages as Array<{ role: string; content: string }>) || []
  const formattedChat = chatMessages
    .map(m => `${m.role === 'user' ? 'Visitor' : 'Elena AI'}: ${m.content}`)
    .join('\n')

  const prompt = `You are Elena, the internal AI concierge for Luxor Event Space. Summarize this lead inquiry details for the internal booking team. Highlight what they are planning and synthesize the context from their notes and chat history with you. Keep the summary professional, actionable, and under 150 words.

Inquiry Details:
- Name: ${name}
- Email: ${email}
- Phone: ${phone}
- Event Type: ${eventType}
- Guest Count: ${guestCount}
- Target Date: ${targetDate}
- Visitor Notes: ${notes}

Chat History with Elena:
${formattedChat || 'No chat history.'}
`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
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
      console.error(`OpenRouter error: ${response.status} ${await response.text()}`)
      return 'AI Summary failed to generate.'
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || 'No AI summary generated.'
  } catch (error) {
    console.error('Error generating AI summary:', error)
    return 'Error generating AI summary.'
  }
}

/**
 * Builds the branded HTML email content.
 */
function buildBrandedNotificationHtml(inquiry: LuxorInquiry, aiSummary: string): string {
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
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:600px;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
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

/**
 * Core notification trigger function.
 */
export async function sendInquiryNotificationEmail(inquiry: LuxorInquiry): Promise<void> {
  try {
    // 1. Fetch unique configured notification emails from preferences
    const preferences = await supabaseRest<Array<{ notification_emails?: string }>>(
      'luxor_user_preferences?select=notification_emails'
    )
    
    const uniqueEmails = new Set<string>()
    if (Array.isArray(preferences)) {
      for (const pref of preferences) {
        if (pref.notification_emails) {
          const emails = pref.notification_emails
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean)
          for (const email of emails) {
            uniqueEmails.add(email)
          }
        }
      }
    }

    // Default fallback
    if (uniqueEmails.size === 0) {
      uniqueEmails.add('booking@luxoratlaspalmas.com')
    }

    // 2. Generate the AI Summary
    const aiSummary = await generateAiSummary(inquiry)

    // 3. Build HTML Template
    const htmlContent = buildBrandedNotificationHtml(inquiry, aiSummary)

    // 4. Send email to each recipient
    const recipientList = Array.from(uniqueEmails)
    const subject = `[New Lead] ${inquiry.full_name} - ${inquiry.event_type || 'Event Inquiry'}`

    console.log(`Sending internal inquiry notification email to: ${recipientList.join(', ')}`)

    await Promise.all(
      recipientList.map(async (recipient) => {
        try {
          await sendLuxorZohoEmail({
            to: recipient,
            subject,
            content: htmlContent,
            from: 'booking@luxoratlaspalmas.com',
            fromName: 'Luxor Lead Alerts',
          })
        } catch (sendError) {
          console.error(`Failed to send lead alert to ${recipient}:`, sendError)
        }
      })
    )
  } catch (error) {
    console.error('Failed to process lead notification email:', error)
  }
}
