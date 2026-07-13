import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { EmailBlock } from '@/app/(portal)/portal/marketing/emailTemplates'
import { LUXOR_GRAND_OPENING } from '@/lib/luxorGrandOpening'

async function fetchCampaignRecipients(audienceLabel: string): Promise<{ email: string; name: string | null }[]> {
  const labelClean = audienceLabel.trim().toLowerCase()
  let list: { email?: unknown; full_name?: unknown }[] = []

  if (labelClean === 'marketing list' || labelClean === 'all marketing contacts') {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_marketing_list?select=email,full_name').catch(() => [])
  } else if (labelClean === 'grand_opening_rsvp' || labelClean.includes('grand opening')) {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_marketing_list?select=email,full_name&source=eq.grand_opening_rsvp').catch(() => [])
  } else if (labelClean === 'all inquiries') {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_inquiries?select=email,full_name').catch(() => [])
  } else if (labelClean.includes('wedding')) {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_inquiries?select=email,full_name&event_type=ilike.*wedding*').catch(() => [])
  } else if (labelClean.includes('quince') || labelClean.includes('quinceañera')) {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_inquiries?select=email,full_name&event_type=ilike.*quince*').catch(() => [])
  } else if (labelClean.includes('@')) {
    return audienceLabel.split(/[,;\s]+/).map(email => ({
      email: email.trim().toLowerCase(),
      name: null
    })).filter(r => r.email.includes('@'))
  } else {
    list = await supabaseRest<Record<string, unknown>[]>('luxor_marketing_list?select=email,full_name').catch(() => [])
  }

  const seen = new Set<string>()
  const results: { email: string; name: string | null }[] = []
  for (const item of list) {
    const email = String(item.email || '').trim().toLowerCase()
    if (email && !seen.has(email)) {
      seen.add(email)
      results.push({
        email,
        name: typeof item.full_name === 'string' ? item.full_name : null
      })
    }
  }
  return results
}

type ToolCall = {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

function sanitizeCampaignBlocks(value: unknown): EmailBlock[] {
  if (!Array.isArray(value)) return []

  const clean = (item: unknown): unknown => {
    if (typeof item === 'string') {
      return item
        .replace(/<[^>]*>/g, '')
        .replace(/\bbestie\b[!,]?/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    }
    if (Array.isArray(item)) return item.map(clean)
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, clean(child)]))
    }
    return item
  }

  return value.map(clean) as EmailBlock[]
}

const SYSTEM_PROMPT = `You are Elena, the internal AI concierge, COO, CFO, Chief of Marketing, and business mentor all-in-one for the Luxor Event Space Owner Portal.

Your personality is that of a warm, supportive, and slightly playful "girl best friend" (using words like "bestie", "girl", "hey", "let's do this!", "we've got this") but you are a "tamed" assistant—meaning you remain highly intelligent, precise, and completely focused on executive operations, financial analysis, and strategic growth.

Your primary role is to help the owner run the business. You analyze numbers (like a CFO), manage operational statuses and tasks (like a COO), brainstorm growth ideas (like a Chief of Marketing), and provide strategic guidance (like a Mentor).

### CURRENT LUXOR EVENT CONTEXT:
- Luxor's Grand Opening Showcase is ${LUXOR_GRAND_OPENING.dateLabel}, from ${LUXOR_GRAND_OPENING.timeLabel} at Luxor Event Space, ${LUXOR_GRAND_OPENING.address}.
- The showcase includes venue tours, free tastings, a vendor showcase, giveaways, and live music.
- The primary call to action is "RSVP Now" and it should link to "/grand-opening-rsvp".
- Guests can also schedule a private tour at "/visit" as a secondary option.
- The public RSVP flow collects attendee count and the guest's future event interest. The campaign key is "grand_opening_2026_07_25".
- For Grand Opening campaigns, use the audience label "grand_opening_rsvp" so the builder and sender select the RSVP marketing list.
- The confirmed event time is ${LUXOR_GRAND_OPENING.timeLabel}. State it clearly in every Grand Opening campaign and never ask the owner for the time again unless the owner asks to change it.
- When the owner asks for a Grand Opening campaign, use this context immediately and call "draft_marketing_campaign". Do not ask again for the date, activities, CTA, location, or RSVP link unless the owner asks to change them.

You have access to the venue database via the "execute_database_sql" tool.
Always use SQL queries to answer questions about the database. Do not make up database counts or facts.

### DATABASE TABLE SCHEMA REFERENCE:
1. public.luxor_inquiries
   - id (uuid)
   - created_at, updated_at (timestamptz)
   - status (text: 'new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost')
   - source (text: e.g. 'website')
   - full_name, email, phone (text)
   - event_type (text: e.g. 'Wedding', 'Quinceañera', 'Corporate', 'Baby Shower')
   - target_date (text: text representation of target date/range)
   - guest_count (integer)
   - preferred_tour_date (date), preferred_tour_time (text)
   - package_interest (text)
   - message (text)
   - pipeline_stage (text: 'inquiry', 'tour', 'proposal_sent', 'book_reserve', 'planning_begins', 'final_details', 'setup_event_day', 'after_event', 'closed_lost')
   - tour_attendance_status (text: 'pending', 'attended', 'no_show', 'rescheduled', 'cancelled')
   - tour_confirmed_at, tour_reminder_sent_at (timestamptz)

2. public.luxor_bookings
   - id (uuid)
   - inquiry_id (uuid -> public.luxor_inquiries.id)
   - invoice_id (uuid -> public.luxor_invoices.id)
   - client_name, email, phone (text)
   - event_type (text)
   - event_date (date)
   - start_time, end_time (time)
   - guest_count (integer)
   - package_name (text)
   - status (text: 'draft', 'tentative', 'confirmed', 'completed', 'cancelled')
   - contract_total (numeric), deposit_required (numeric)
   - final_payment_due_date (date)
   - contract_status (text: 'not_sent', 'sent', 'viewed', 'signed', 'needs_follow_up', 'void')
   - contract_signed_at (timestamptz)
   - security_deposit_status (text)

3. public.luxor_invoices
   - id (uuid)
   - inquiry_id (uuid -> public.luxor_inquiries.id)
   - client_name, event_type, description (text)
   - subtotal, tax_rate, total (numeric)
   - status (text: 'draft', 'sent', 'paid', 'void')
   - due_date (date), paid_at (timestamptz)

4. public.luxor_payments
   - id (uuid)
   - booking_id (uuid -> public.luxor_bookings.id)
   - invoice_id (uuid -> public.luxor_invoices.id)
   - inquiry_id (uuid -> public.luxor_inquiries.id)
   - amount (numeric)
   - status (text: 'pending', 'paid', 'failed', 'refunded', 'void')
   - payment_method (text: 'credit_card', 'bank_transfer', etc.)
   - paid_at (timestamptz)

5. public.luxor_tasks
   - id (uuid)
   - inquiry_id (uuid -> public.luxor_inquiries.id)
   - title, description (text)
   - due_date (date), completed_at (timestamptz)
   - priority (text: 'low', 'medium', 'high')
   - status (text: 'pending', 'completed')

6. public.luxor_notes
   - id (uuid)
   - inquiry_id (uuid -> public.luxor_inquiries.id)
   - author, content, note_type (text)

7. public.luxor_vendors
   - id (uuid)
   - vendor_type, name, email, phone (text)
   - rating (text), coi_active (boolean)

8. public.luxor_inventory
   - id (uuid)
   - category (text: 'furniture', 'supplies', 'decor', 'other')
   - name (text), count (integer), unit (text)
   - status (text: 'Good', 'Low', 'Out of Stock')

9. public.luxor_bills
   - id (uuid)
   - service, frequency, provider (text)
   - amount (numeric)
   - status (text: 'paid', 'unpaid', 'overdue')
   - due_date (date)

10. public.luxor_cleaning_logs
    - id (uuid)
    - task_name (text)
    - completed (boolean)
    - completed_at (timestamptz)
    - notes (text)

11. public.luxor_utility_readings
    - id (uuid)
    - sensor_type (text: 'electric', 'water', 'gas', 'internet', 'security')
    - current_load (text)
    - previous_bill_total (numeric)
    - anomaly_status (text)

12. public.luxor_booking_expenses
    - id (uuid)
    - booking_id (uuid -> public.luxor_bookings.id)
    - category, description, vendor_name (text)
    - amount (numeric)
    - incurred_on (date)
    - status (text: 'planned', 'incurred', 'paid', 'cancelled')

13. public.luxor_email_jobs
    - id (uuid)
    - created_at, updated_at (timestamptz)
    - inquiry_id (uuid -> public.luxor_inquiries.id)
    - booking_id (uuid -> public.luxor_bookings.id)
    - signature_request_id (uuid -> public.luxor_signature_requests.id)
    - job_type (text: 'tour_confirmation', 'tour_reminder', 'tour_no_show_reschedule', 'contract_signature', 'marketing_campaign')
    - status (text: 'queued', 'sending', 'sent', 'failed', 'cancelled')
    - recipient_email (text)
    - subject, body (text)
    - scheduled_for, sent_at (timestamptz)
    - last_error (text)
    - attempts (integer)

14. public.luxor_marketing_campaigns
    - id (uuid)
    - created_at, updated_at (timestamptz)
    - name, subject, html_body (text)
    - status (text: 'draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')
    - audience_label (text)
    - scheduled_for, sent_at (timestamptz)
    - recipient_count (integer)

15. public.luxor_marketing_recipients
    - id (uuid)
    - created_at, updated_at (timestamptz)
    - campaign_id (uuid -> public.luxor_marketing_campaigns.id)
    - email_job_id (uuid -> public.luxor_email_jobs.id)
    - email, name (text)
    - status (text: 'queued', 'sent', 'failed', 'cancelled')
    - tracking_token (text)
    - sent_at (timestamptz)
    - open_count (integer), click_count (integer)
    - first_opened_at, last_opened_at, last_clicked_at (timestamptz)

16. public.luxor_marketing_events
    - id (uuid)
    - created_at (timestamptz)
    - campaign_id (uuid -> public.luxor_marketing_campaigns.id)
    - recipient_id (uuid -> public.luxor_marketing_recipients.id)
    - event_type (text: 'open', 'click', 'unsubscribe')
    - url, ip_address, user_agent, device_type (text)

17. public.luxor_marketing_list
    - id (uuid)
    - created_at (timestamptz)
    - email (text, unique)
    - full_name, source (text)

18. public.luxor_signature_requests
    - id (uuid)
    - created_at, updated_at (timestamptz)
    - booking_id (uuid -> public.luxor_bookings.id)
    - inquiry_id (uuid -> public.luxor_inquiries.id)
    - client_name, client_email (text)
    - token (text)
    - status (text: 'draft', 'sent', 'viewed', 'signed', 'void')
    - contract_title, contract_body (text)
    - signed_name (text), signed_at (timestamptz)


### GUIDELINES:
- Execute read-only SQL queries (using SELECT statements) to lookup info immediately using the "execute_database_sql" tool.
- If you need to perform write operations (like INSERT, UPDATE, or DELETE), you are NOT allowed to execute it directly via the "execute_database_sql" tool. Instead, you MUST call the "request_action_confirmation" tool. This will prompt the user with interactive Confirm/Cancel buttons.
- To draft an email for the user to review and approve before sending, ALWAYS call the "draft_email" tool. Never describe an email in text—always use the tool. The user will see a preview card with Send and Reprompt options.
- To draft a bulk marketing email campaign for the user to review, ALWAYS call the "draft_marketing_campaign" tool. Never output campaign details in text—always use the tool. The user will see a preview card with Send, Schedule, and Open in Builder options.
- Elena's chat with the owner may be warm and playful, but customer-facing emails and campaigns must sound polished, welcoming, and professional. Never use "bestie", "girl", or similar private chat language inside email subjects, body copy, buttons, or campaign blocks.
- Campaign block fields must contain plain text only. Do not put HTML tags such as <b>, <strong>, <p>, or <br> in any block field; the email renderer applies the presentation.
- Always double check spelling (e.g. use Quinceañera or Quinceañeras with the Spanish "ñ" if searching text fields, but keep query structures precise).
- If your query returns no results, check if you matched the casing or exact spelling.
- Present answers in a clean, readable layout (use markdown tables or bulleted lists for query results).
- Limit output results when necessary (e.g. "LIMIT 10" or "LIMIT 5") to avoid blowing up context, unless requested.

### CAMPAIGN DRAFTING & IMAGES GUIDE:
Available Email Blocks to use in your blocks array:
1. "hero": headline, subheadline, backgroundImage, overlayOpacity, textAlign, ctaLabel, ctaUrl, ctaVisible.
2. "text": content, fontSize, color, textAlign.
3. "image_text": imageUrl, imageAlt, imagePosition, headline, body, ctaLabel, ctaUrl.
4. "button": label, url, align, bgColor, textColor.
5. "two_column": leftHeadline, leftBody, rightHeadline, rightBody.
6. "divider": color, thickness, style.
7. "spacer": height.
8. "footer": companyName, address, phone, website.

Exposing Venue Image Directory (use these relative paths in your imageUrl/backgroundImage properties):
- Dining Hall:
  - "/images/dining-hall/main-hall-wedding-wide.png" (weddings)
  - "/images/dining-hall/main-hall-wedding-dance-candid.png" (wedding receptions)
  - "/images/dining-hall/main-hall-quinceanera-angle.png" (quinceañeras)
  - "/images/dining-hall/main-hall-dinner-service-candid.png" (dinner service)
  - "/images/dining-hall/main-hall-corporate-cocktail.png" (corporate cocktail setup)
  - "/images/dining-hall/main-hall-conversation-candid.png" (guests mingling/general)
  - "/images/dining-hall/main-hall-table-toast-candid.png" (toast/celebrations)
- Luxor Lounge:
  - "/images/luxor-lounge/luxor-lounge-empty.png" (empty lounge view)
  - "/images/luxor-lounge/luxor-lounge-wedding.png" (intimate wedding reception)
  - "/images/luxor-lounge/luxor-lounge-quinceanera.png" (quinceañera lounge setup)
  - "/images/luxor-lounge/luxor-lounge-baby-shower.png" (baby showers)
  - "/images/luxor-lounge/luxor-lounge-corporate.png" (intimate corporate gatherings)

- Maintain your warm "girl best friend" executive/mentor personality. Use emojis naturally (e.g. 💅, 📈, 💕, ✨, 💁‍♀️) but do not overdo it. Always give valuable, executive-level business advice and mentorship based on the data you find.`

const TOOLS_DEFINITION = [
  {
    type: 'function',
    function: {
      name: 'execute_database_sql',
      description: 'Run SELECT (read-only) SQL statements against the venue database. Tables are under the public schema, prefix them with "public." e.g. public.luxor_inquiries. INSERT, UPDATE, and DELETE queries are blocked in this tool.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The exact SELECT query to execute in PostgreSQL.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_action_confirmation',
      description: 'Ask the user for button-click confirmation before executing any INSERT, UPDATE, or DELETE statements. Do not call execute_database_sql for writes.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The exact INSERT, UPDATE, or DELETE SQL statement to execute upon confirmation.'
          },
          summary: {
            type: 'string',
            description: 'A user-friendly description of what this modification does, e.g. "Create a task to follow up with Sarah Smith on Tuesday".'
          }
        },
        required: ['query', 'summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'Compose an email for the owner to review. The owner will see a preview card with To, Subject, and Body. They can approve to send it immediately or ask you to revise it. Use this any time you need to send an email on behalf of Luxor Event Space.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient email address (e.g. client@example.com)'
          },
          subject: {
            type: 'string',
            description: 'Email subject line'
          },
          body: {
            type: 'string',
            description: 'Plain-text email body. Write it in full — warm, professional, and on-brand for Luxor.'
          },
          recipient_name: {
            type: 'string',
            description: 'Display name of the recipient (optional, used for the preview card only)'
          }
        },
        required: ['to', 'subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_marketing_campaign',
      description: 'Draft a marketing campaign to send or schedule. The owner will see a preview card with blocks, subject, name, and schedule. They can approve to send/schedule it immediately, open it in the builder to edit, or ask you to revise.',
      parameters: {
        type: 'object',
        properties: {
          campaignName: {
            type: 'string',
            description: 'Internal campaign name for tracking (e.g. Quinceañera Booking Promotion)'
          },
          subject: {
            type: 'string',
            description: 'Subject line of the email'
          },
          audienceLabel: {
            type: 'string',
            description: 'Filter keyword for target audience: "Marketing List", "All Inquiries", "Weddings", "Quinceañeras", or a list of comma-separated email addresses'
          },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['hero', 'text', 'image_text', 'button', 'two_column', 'divider', 'spacer', 'footer']
                },
                headline: { type: 'string' },
                subheadline: { type: 'string' },
                backgroundImage: { type: 'string' },
                overlayOpacity: { type: 'number' },
                textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
                ctaLabel: { type: 'string' },
                ctaUrl: { type: 'string' },
                ctaVisible: { type: 'boolean' },
                content: { type: 'string' },
                fontSize: { type: 'number' },
                color: { type: 'string' },
                imageUrl: { type: 'string' },
                imageAlt: { type: 'string' },
                imagePosition: { type: 'string', enum: ['left', 'right'] },
                body: { type: 'string' },
                label: { type: 'string' },
                url: { type: 'string' },
                align: { type: 'string', enum: ['left', 'center', 'right'] },
                bgColor: { type: 'string' },
                textColor: { type: 'string' },
                thickness: { type: 'number' },
                style: { type: 'string' },
                height: { type: 'number' },
                companyName: { type: 'string' },
                address: { type: 'string' },
                phone: { type: 'string' },
                website: { type: 'string' }
              },
              required: ['type']
            }
          },
          scheduledFor: {
            type: 'string',
            description: 'Optional ISO Date string to schedule the campaign (e.g. "2026-07-20T10:00:00Z"). Leave null to send immediately upon approval.'
          }
        },
        required: ['campaignName', 'subject', 'audienceLabel', 'blocks']
      }
    }
  }
]

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages, activePath, confirmQuery, confirmSummary, confirmEmail, confirmCampaign } = (await request.json()) as { 
      messages?: ChatMessage[]
      activePath?: string
      confirmQuery?: string
      confirmSummary?: string
      confirmEmail?: { to: string; subject: string; body: string; recipient_name?: string }
      confirmCampaign?: {
        name: string
        subject: string
        audienceLabel: string
        blocks: EmailBlock[]
        scheduledFor?: string | null
      }
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages body' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OpenRouter API key' }, { status: 500 })
    }

    const executedQueries: Array<{ query: string; result: unknown }> = []

    // 1. If this is a direct confirmation execute request
    if (confirmQuery && confirmSummary) {
      let queryResult: unknown
      try {
        const rpcRes = await supabaseRest<unknown>('rpc/exec_sql', {
          method: 'POST',
          body: JSON.stringify({ query: confirmQuery })
        })
        queryResult = rpcRes
        executedQueries.push({ query: confirmQuery, result: rpcRes })
      } catch (dbErr: unknown) {
        console.error('Confirmation query failed:', dbErr)
        queryResult = { error: dbErr instanceof Error ? dbErr.message : 'Database query failed' }
        executedQueries.push({ query: confirmQuery, result: queryResult })
      }

      // Feed confirmation result back to Gemini so Elena can report the success
      const confirmationMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.slice(-15),
        {
          role: 'system',
          content: `[CONFIRMATION_RESULT] The user clicked 'Confirm' to execute the action: "${confirmSummary}". The SQL query "${confirmQuery}" has been successfully executed with database response: ${JSON.stringify(queryResult)}. Report this result back to the user in your warm best-friend executive style (mentioning that the action was successfully executed).`
        }
      ]

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://luxoreventspace.com',
          'X-Title': 'Luxor Event Space Elena CRM',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.2,
          messages: confirmationMessages
        })
      })

      if (!response.ok) {
        return NextResponse.json({ 
          reply: `Done bestie! I ran the query and it succeeded, but I had trouble getting my final reply through. Query output: ${JSON.stringify(queryResult)}`,
          executedQueries 
        })
      }

      const responseData = await response.json()
      const replyText = responseData.choices?.[0]?.message?.content || 'Action executed successfully!'

      return NextResponse.json({
        reply: replyText,
        executedQueries
      })
    }

    // 1b. If this is a direct email send confirmation
    if (confirmEmail) {
      let emailResult: { ok: boolean; error?: string }
      try {
        const { sendLuxorZohoEmail } = await import('@/lib/zohoMailServer')
        await sendLuxorZohoEmail({
          to: confirmEmail.to,
          subject: confirmEmail.subject,
          content: confirmEmail.body,
          from: 'booking@luxoratlaspalmas.com',
          fromName: 'Luxor Event Space',
        })
        emailResult = { ok: true }
      } catch (sendErr: unknown) {
        console.error('Elena email send failed:', sendErr)
        emailResult = { ok: false, error: sendErr instanceof Error ? sendErr.message : 'Unknown error' }
      }

      const emailFeedbackMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.slice(-15),
        {
          role: 'system',
          content: emailResult.ok
            ? `[EMAIL_SENT] The email to "${confirmEmail.to}" with subject "${confirmEmail.subject}" was successfully sent via Luxor's Zoho mailbox. Let the owner know it's sent in your warm best-friend style.`
            : `[EMAIL_FAILED] The email to "${confirmEmail.to}" could not be sent. Error: ${emailResult.error}. Apologize and suggest checking the Zoho mail config.`
        }
      ]

      const emailFeedbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://luxoreventspace.com',
          'X-Title': 'Luxor Event Space Elena CRM',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.2,
          messages: emailFeedbackMessages
        })
      })

      const feedbackData = emailFeedbackResponse.ok ? await emailFeedbackResponse.json() : null
      const feedbackReply = feedbackData?.choices?.[0]?.message?.content ||
        (emailResult.ok ? `Done bestie! ✉️ The email to ${confirmEmail.to} is sent!` : `I couldn\'t send that email. Error: ${emailResult.error}`)

      return NextResponse.json({ reply: feedbackReply, executedQueries })
    }

    // 1c. If this is a campaign approval execute request
    if (confirmCampaign) {
      let campaignResult: { ok: boolean; error?: string; campaignId?: string; recipientCount?: number }
      try {
        const recipients = await fetchCampaignRecipients(confirmCampaign.audienceLabel)
        if (recipients.length === 0) {
          throw new Error(`No recipients found for target audience label: "${confirmCampaign.audienceLabel}".`)
        }

        const { renderEmailToHtml } = await import('@/app/(portal)/portal/marketing/EmailBuilder/emailRenderer')
        const html = renderEmailToHtml(confirmCampaign.subject, confirmCampaign.blocks)

        const { createMarketingCampaign, sendMarketingCampaignNow } = await import('@/lib/luxorMarketingServer')
        const detail = await createMarketingCampaign({
          name: confirmCampaign.name,
          subject: confirmCampaign.subject,
          htmlBody: html,
          recipients,
          scheduledFor: confirmCampaign.scheduledFor || null,
          audienceLabel: confirmCampaign.audienceLabel,
          createdBy: session.email,
        })

        const campaignId = detail?.campaign?.id
        if (!confirmCampaign.scheduledFor && campaignId) {
          await sendMarketingCampaignNow(campaignId)
        }

        campaignResult = { ok: true, campaignId, recipientCount: recipients.length }
      } catch (campErr: unknown) {
        console.error('Elena campaign create failed:', campErr)
        campaignResult = { ok: false, error: campErr instanceof Error ? campErr.message : 'Unknown error' }
      }

      const campaignFeedbackMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.slice(-15),
        {
          role: 'system',
          content: campaignResult.ok
            ? `[CAMPAIGN_CREATED] The marketing campaign "${confirmCampaign.name}" with subject "${confirmCampaign.subject}" was successfully created and ${confirmCampaign.scheduledFor ? 'scheduled' : 'sent immediately'} to ${campaignResult.recipientCount} recipients. Let the owner know it's queued in your warm best-friend style.`
            : `[CAMPAIGN_FAILED] The campaign could not be created/sent. Error: ${campaignResult.error}. Apologize and suggest checking recipient filters.`
        }
      ]

      const campaignFeedbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://luxoreventspace.com',
          'X-Title': 'Luxor Event Space Elena CRM',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.2,
          messages: campaignFeedbackMessages
        })
      })

      const feedbackData = campaignFeedbackResponse.ok ? await campaignFeedbackResponse.json() : null
      const feedbackReply = feedbackData?.choices?.[0]?.message?.content ||
        (campaignResult.ok ? `Done bestie! ✦ The campaign is queued for ${campaignResult.recipientCount} recipients!` : `I couldn\'t create that campaign. Error: ${campaignResult.error}`)

      return NextResponse.json({ reply: feedbackReply, executedQueries })
    }

    // 2. Normal assistant request
    const openrouterMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT }
    ]

    // Context Injection: Parse Path for Leads details
    if (activePath) {
      openrouterMessages.push({
        role: 'system',
        content: `User is currently browsing route: "${activePath}".`
      })

      const leadMatch = activePath.match(/\/portal\/leads\/([a-f0-9-]{36})/)
      if (leadMatch) {
        const activeLeadId = leadMatch[1]

        // Auto-fetch full lead record so Elena has all client details without needing a separate query
        try {
          const [leadRecord] = await supabaseRest<Record<string, unknown>[]>(
            `luxor_inquiries?select=*&id=eq.${encodeURIComponent(activeLeadId)}&limit=1`
          )
          const notesRaw = await supabaseRest<Record<string, unknown>[]>(
            `luxor_notes?select=id,content,created_at,author&inquiry_id=eq.${encodeURIComponent(activeLeadId)}&order=created_at.desc&limit=10`
          ).catch(() => [] as Record<string, unknown>[])

          if (leadRecord) {
            const noteSummary = notesRaw.length > 0
              ? notesRaw.map((n, i) => `Note ${i + 1} (${n.created_at}): ${n.content}`).join('\n')
              : 'No notes on file.'

            let emailHistorySummary = 'No recent emails found.'
            if (leadRecord.email) {
              try {
                const { listLuxorZohoMessagesForAddress } = await import('@/lib/zohoMailServer')
                const messages = await listLuxorZohoMessagesForAddress(leadRecord.email as string, 8)
                if (messages.length > 0) {
                  emailHistorySummary = messages.map((m, i) => {
                    const dirLabel = m.direction === 'outgoing' ? 'Outbound (Sent by Luxor)' : 'Inbound (Received from Client)'
                    let dateStr = 'Unknown Time'
                    if (m.receivedAt) {
                      const numericTime = Number(m.receivedAt)
                      const dateObj = Number.isFinite(numericTime) ? new Date(numericTime) : new Date(m.receivedAt)
                      if (!Number.isNaN(dateObj.getTime())) {
                        dateStr = dateObj.toLocaleString()
                      }
                    }
                    return `Email ${i + 1} [${dirLabel} - ${dateStr}]
Subject: ${m.subject}
Summary: ${m.summary || '(No content summary)'}`
                  }).join('\n\n')
                }
              } catch (err) {
                console.error('Failed to pre-fetch Zoho email thread for Elena context:', err)
              }
            }

            openrouterMessages.push({
              role: 'system',
              content: `ACTIVE LEAD CONTEXT — The user is viewing this lead. Use all details below as full context for any emails, tasks, or analysis you perform. Do not ask the user to re-supply information that is already here.

Lead ID: ${activeLeadId}
Name: ${leadRecord.full_name ?? 'Unknown'}
Email: ${leadRecord.email ?? 'Not provided'}
Phone: ${leadRecord.phone ?? 'Not provided'}
Event Type: ${leadRecord.event_type ?? 'Not specified'}
Target Date: ${leadRecord.target_date ?? 'Not specified'}
Guest Count: ${leadRecord.guest_count ?? 'Not specified'}
Package Interest: ${leadRecord.package_interest ?? 'Not specified'}
Pipeline Stage: ${leadRecord.pipeline_stage ?? 'inquiry'}
Status: ${leadRecord.status ?? 'new'}
Source: ${leadRecord.source ?? 'Unknown'}
Notes from client: ${leadRecord.message ?? 'None'}
Preferred Tour Date: ${leadRecord.preferred_tour_date ?? 'None'}
Preferred Tour Time: ${leadRecord.preferred_tour_time ?? 'None'}

Internal Notes:
${noteSummary}

Email Communication History (Zoho Mail):
${emailHistorySummary}`
            })
          } else {
            openrouterMessages.push({
              role: 'system',
              content: `CONTEXT: The user is currently viewing lead ID: '${activeLeadId}'. The record could not be pre-loaded — use execute_database_sql to look it up if needed.`
            })
          }
        } catch {
          openrouterMessages.push({
            role: 'system',
            content: `CONTEXT: The user is currently viewing lead ID: '${activeLeadId}'. Use this ID when the user references 'this lead', 'this client', or 'them'.`
          })
        }
      }
    }

    // Append conversation history
    openrouterMessages.push(...messages.slice(-15))

    let loopCount = 0
    const maxLoops = 5
    let finalContent = 'I encountered an issue processing your request.'
    let confirmationPayload: { query: string; summary: string } | null = null

    while (loopCount < maxLoops) {
      loopCount++

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://luxoreventspace.com',
          'X-Title': 'Luxor Event Space Elena CRM',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.1,
          messages: openrouterMessages,
          tools: TOOLS_DEFINITION,
          tool_choice: 'auto'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('OpenRouter error:', errorText)
        return NextResponse.json({ 
          reply: 'Sorry, I had trouble communicating with the AI service.',
          executedQueries 
        }, { status: 200 })
      }

      const responseData = await response.json()
      const choice = responseData.choices?.[0]
      const assistantMessage = choice?.message

      if (!assistantMessage) {
        break
      }

      openrouterMessages.push(assistantMessage)

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        let confirmationInterrupted = false

        for (const toolCall of assistantMessage.tool_calls) {
          // A1. Marketing campaign draft request
          if (toolCall.function?.name === 'draft_marketing_campaign') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              confirmationPayload = {
                query: JSON.stringify({ 
                  __campaignDraft: true, 
                  name: args.campaignName, 
                  subject: args.subject, 
                  audienceLabel: args.audienceLabel, 
                  blocks: sanitizeCampaignBlocks(args.blocks), 
                  scheduledFor: args.scheduledFor 
                }),
                summary: `Draft campaign "${args.campaignName}" for target "${args.audienceLabel}"`
              }
              confirmationInterrupted = true
            } catch (err) {
              console.error('Failed to parse draft_marketing_campaign args:', err)
            }
          }
          // A. Email draft request
          else if (toolCall.function?.name === 'draft_email') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              confirmationPayload = {
                query: JSON.stringify({ __emailDraft: true, to: args.to, subject: args.subject, body: args.body, recipient_name: args.recipient_name }),
                summary: `Send email to ${args.recipient_name || args.to}: "${args.subject}"`
              }
              confirmationInterrupted = true
            } catch (err) {
              console.error('Failed to parse draft_email args:', err)
            }
          }
          // B. DB write confirmation request
          else if (toolCall.function?.name === 'request_action_confirmation') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              
              confirmationPayload = {
                query: args.query,
                summary: args.summary
              }
              confirmationInterrupted = true
            } catch (err) {
              console.error('Failed to parse confirmation args:', err)
            }
          }
          // C. Normal database query
          else if (toolCall.function?.name === 'execute_database_sql') {
            let sqlQuery = ''
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              sqlQuery = args.query
            } catch (err) {
              console.error('Failed to parse query args:', err)
            }

            if (sqlQuery) {
              let queryResult: unknown
              
              // Double check security block on writes
              const queryClean = sqlQuery.trim().toLowerCase()
              const isWrite = queryClean.startsWith('insert') || 
                              queryClean.startsWith('update') || 
                              queryClean.startsWith('delete') ||
                              queryClean.startsWith('alter') ||
                              queryClean.startsWith('drop') ||
                              queryClean.startsWith('create')

              if (isWrite) {
                queryResult = { error: "Security Exception: Write operations are blocked in execute_database_sql. You must call request_action_confirmation instead." }
                executedQueries.push({ query: sqlQuery, result: queryResult })
              } else {
                try {
                  const rpcRes = await supabaseRest<unknown>('rpc/exec_sql', {
                    method: 'POST',
                    body: JSON.stringify({ query: sqlQuery })
                  })
                  queryResult = rpcRes
                  executedQueries.push({ query: sqlQuery, result: rpcRes })
                } catch (dbErr: unknown) {
                  console.error('Database query failed:', dbErr)
                  queryResult = { error: dbErr instanceof Error ? dbErr.message : 'Database query failed' }
                  executedQueries.push({ query: sqlQuery, result: queryResult })
                }
              }

              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'execute_database_sql',
                content: JSON.stringify(queryResult)
              })
            }
          }
        }

        // If we need user confirmation, halt execution and report to client
        if (confirmationInterrupted && confirmationPayload) {
          finalContent = assistantMessage.content || `I need your confirmation to run this action, bestie:`
          break
        }
      } else {
        finalContent = assistantMessage.content || ''
        break
      }
    }

    return NextResponse.json({
      reply: finalContent,
      confirmation: confirmationPayload || undefined,
      executedQueries
    })
  } catch (err: unknown) {
    console.error('Internal Elena API error:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
