import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { sendLuxorDirectText } from '@/lib/luxorDirectTextServer'
import { getLuxorUserProfile, LuxorUserProfile } from '@/lib/luxorUserProfileServer'

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
  executedQueries?: Record<string, unknown>[]
  confirmation?: {
    query: string
    summary: string
  }
  emailDraft?: {
    recipientEmail: string
    recipientName?: string
    inquiryId?: string
    subject: string
    body: string
    templateType?: string
  }
  crmUpdateCard?: Record<string, unknown>
  contractCard?: Record<string, unknown>
  invoiceCard?: Record<string, unknown>
  taskCard?: Record<string, unknown>
}

const SYSTEM_PROMPT = `You are Elena, the internal AI concierge, COO, CFO, Chief of Marketing, and business mentor all-in-one for the Luxor Event Space Owner Portal.

Your personality is that of a warm, supportive, and slightly playful "girl best friend" (using words like "bestie", "girl", "hey", "let's do this!", "we've got this") but you are a "tamed" assistant—meaning you remain highly intelligent, precise, and completely focused on executive operations, financial analysis, and strategic growth.

Your primary role is to help the owner run the business. You analyze numbers (like a CFO), manage operational statuses and tasks (like a COO), brainstorm growth ideas (like a Chief of Marketing), and provide strategic guidance (like a Mentor).

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

19. public.luxor_text_campaigns
    - id, created_at, updated_at (uuid/timestamps)
    - name, body_template, campaign_type, status (text)
    - audience_label (text), audience_filter (jsonb)
    - scheduled_for, sent_at (timestamptz)
    - recipient_count, sent_count, delivered_count, failed_count, reply_count, opt_out_count (integer)


### GUIDELINES:
- Execute read-only SQL queries (using SELECT statements) to lookup info immediately using the "execute_database_sql" tool.
- If you need to perform write operations (like INSERT, UPDATE, or DELETE), you are NOT allowed to execute it directly via the "execute_database_sql" tool. Instead, you MUST call the "request_action_confirmation" tool. This will prompt the user with interactive Confirm/Cancel buttons.
- Always double check spelling (e.g. use Quinceañera or Quinceañeras with the Spanish "ñ" if searching text fields, but keep query structures precise).
- If your query returns no results, check if you matched the casing or exact spelling.
- Present answers in a clean, readable layout (use markdown tables or bulleted lists for query results).
- Limit output results when necessary (e.g. "LIMIT 10" or "LIMIT 5") to avoid blowing up context, unless requested.
- When the owner asks you to create or draft a text campaign, call "create_text_campaign_draft". This prepares the Text Campaigns builder but never sends anything. Include "Luxor Event Space" and end the body with "Reply STOP to opt out." Never invent balances, dates, availability, or payment status.
- When the owner asks you to text one specific client, first query the lead so you have the correct inquiry ID, name, phone, status, and relevant event/tour context. Then call "request_text_message_confirmation". The owner must confirm before the message is sent. Never use this tool for bulk sends.
- When the owner asks you to draft, write, compose, or send an email to a client or lead, call "prepare_email_draft". This presents an interactive mini email composer card inside Elena Chat where the owner can edit the subject and body inline, preview the rendered HTML email with the signed-in user's saved signature, and send with one click. Use the sender identity provided in the system context. Never output placeholders such as [Your Name].
- When the owner asks you to update lead/booking fields (such as pipeline stage, status, target date, guest count), call "prepare_crm_update_card".
- When the owner asks you to send or resend a contract or digital agreement, call "prepare_contract_card".
- When the owner asks you to send or resend an invoice, payment link, or proposal, call "prepare_invoice_card".
- When the owner asks you to create a task, reminder, or follow-up note, call "prepare_task_card".
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
      name: 'create_text_campaign_draft',
      description: 'Prepare a safe text campaign draft in the portal Text Campaigns builder. This does not send or queue messages.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'A short internal campaign name.'
          },
          bodyTemplate: {
            type: 'string',
            description: 'The SMS body, no more than 480 characters. It must identify Luxor Event Space and include Reply STOP to opt out.'
          },
          campaignType: {
            type: 'string',
            enum: ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice', 'elena']
          }
        },
        required: ['name', 'bodyTemplate', 'campaignType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_text_message_confirmation',
      description: 'Ask the owner to confirm a one-to-one text message to a specific Luxor client. Never use for bulk messages.',
      parameters: {
        type: 'object',
        properties: {
          inquiryId: { type: 'string', description: 'The Luxor inquiry UUID returned by a database lookup.' },
          phone: { type: 'string', description: 'The exact client phone returned by the database lookup.' },
          contactName: { type: 'string', description: 'The client name returned by the database lookup.' },
          body: { type: 'string', description: 'The complete text message to send, no more than 1,600 characters.' },
          summary: { type: 'string', description: 'A clear confirmation summary naming the client and showing the message purpose.' }
        },
        required: ['inquiryId', 'phone', 'contactName', 'body', 'summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_email_draft',
      description: 'Prepare an interactive mini email draft for the owner inside Elena Chat. Call this tool whenever the owner asks to draft, compose, write, or send an email to a lead or client.',
      parameters: {
        type: 'object',
        properties: {
          recipientEmail: { type: 'string', description: 'The recipient email address. Query lead first if unknown.' },
          recipientName: { type: 'string', description: 'The recipient full name.' },
          inquiryId: { type: 'string', description: 'The linked lead/inquiry UUID if available.' },
          subject: { type: 'string', description: 'A clear, professional email subject line.' },
          body: { type: 'string', description: 'The plain text email message body with paragraph breaks.' },
          templateType: { type: 'string', enum: ['conversational', 'marketing'], description: 'Defaults to conversational for direct 1-on-1 emails.' }
        },
        required: ['subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_crm_update_card',
      description: 'Prepare an interactive CRM lead/booking field updater container for the owner.',
      parameters: {
        type: 'object',
        properties: {
          inquiryId: { type: 'string' },
          bookingId: { type: 'string' },
          clientName: { type: 'string' },
          currentPipelineStage: { type: 'string' },
          currentStatus: { type: 'string' },
          targetDate: { type: 'string' },
          guestCount: { type: 'number' },
          eventType: { type: 'string' }
        },
        required: ['clientName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_contract_card',
      description: 'Prepare an interactive contract signature request container in Elena Chat to send or resend a contract link.',
      parameters: {
        type: 'object',
        properties: {
          inquiryId: { type: 'string' },
          bookingId: { type: 'string' },
          clientName: { type: 'string' },
          clientEmail: { type: 'string' },
          eventType: { type: 'string' },
          eventDate: { type: 'string' },
          contractTotal: { type: 'number' },
          depositRequired: { type: 'number' },
          signingStatus: { type: 'string' },
          signingUrl: { type: 'string' }
        },
        required: ['clientName', 'clientEmail']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_invoice_card',
      description: 'Prepare an interactive invoice and payment link container in Elena Chat.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          inquiryId: { type: 'string' },
          clientName: { type: 'string' },
          clientEmail: { type: 'string' },
          total: { type: 'number' },
          paidTotal: { type: 'number' },
          balanceDue: { type: 'number' },
          status: { type: 'string' },
          checkoutUrl: { type: 'string' }
        },
        required: ['invoiceId', 'clientName', 'total', 'balanceDue', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_task_card',
      description: 'Prepare an interactive CRM operational task container in Elena Chat.',
      parameters: {
        type: 'object',
        properties: {
          inquiryId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueDate: { type: 'string' }
        },
        required: ['title']
      }
    }
  }
]

async function saveChatSessionMessages(
  chatId: string, 
  userEmail: string, 
  updatedMessages: ChatMessage[], 
  apiKey: string,
  firstUserMessage?: string
) {
  try {
    const payload: Record<string, unknown> = {
      messages: updatedMessages,
      updated_at: new Date().toISOString()
    }

    if (firstUserMessage) {
      const current = await supabaseRest<Array<{ title: string }>>(
        `luxor_elena_chats?id=eq.${chatId}&user_email=eq.${encodeURIComponent(userEmail)}&select=title`
      )
      if (current && current.length > 0 && (!current[0].title || current[0].title === 'New Chat Session')) {
        try {
          const titleRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://luxoreventspace.com',
              'X-Title': 'Elena CRM Title Generator',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              temperature: 0.3,
              messages: [
                {
                  role: 'system',
                  content: 'Generate a short, punchy 3-to-5 word title summarizing the user\'s query topic. Do not include quote marks, quotes, or punctuation. Return ONLY the title text.'
                },
                {
                  role: 'user',
                  content: firstUserMessage
                }
              ]
            })
          })

          if (titleRes.ok) {
            const titleData = await titleRes.json()
            const generatedTitle = (titleData.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '')
            if (generatedTitle && generatedTitle.length > 0) {
              payload.title = generatedTitle
            }
          }
        } catch (titleErr) {
          console.error('Failed to generate title:', titleErr)
        }
      }
    }

    await supabaseRest(
      `luxor_elena_chats?id=eq.${chatId}&user_email=eq.${encodeURIComponent(userEmail)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    )
  } catch (err) {
    console.error('Failed to save chat session messages:', err)
  }
}

export async function POST(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages, activePath, confirmQuery, confirmSummary, chatId } = (await request.json()) as { 
      messages?: ChatMessage[]
      activePath?: string
      confirmQuery?: string
      confirmSummary?: string
      chatId?: string
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages body' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OpenRouter API key' }, { status: 500 })
    }

    const executedQueries: Array<{ query: string; result: unknown }> = []
    const senderProfile = await getLuxorUserProfile(session.email)

    // 1. If this is a direct confirmation execute request
    if (confirmQuery && confirmSummary) {
      let queryResult: unknown
      try {
        if (confirmQuery.startsWith('SEND_TEXT:')) {
          const payload = JSON.parse(confirmQuery.slice('SEND_TEXT:'.length)) as {
            inquiryId?: string
            phone?: string
            contactName?: string
            body?: string
          }
          queryResult = await sendLuxorDirectText({
            to: payload.phone,
            body: payload.body,
            inquiryId: payload.inquiryId,
            contactName: payload.contactName,
            ownerEmail: session.email,
          })
          executedQueries.push({ query: 'Send confirmed one-to-one text', result: queryResult })
        } else {
          const rpcRes = await supabaseRest<unknown>('rpc/exec_sql', {
            method: 'POST',
            body: JSON.stringify({ query: confirmQuery })
          })
          queryResult = rpcRes
          executedQueries.push({ query: confirmQuery, result: rpcRes })
        }
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
        const fallbackReply = `Done bestie! I ran the query and it succeeded, but I had trouble getting my final reply through. Query output: ${JSON.stringify(queryResult)}`
        
        if (chatId) {
          const updatedMessages = [
            ...messages,
            {
              role: 'assistant' as const,
              content: fallbackReply,
              executedQueries
            }
          ]
          await saveChatSessionMessages(chatId, session.email, updatedMessages, apiKey)
        }

        return NextResponse.json({ 
          reply: fallbackReply,
          executedQueries 
        })
      }

      const responseData = await response.json()
      const replyText = responseData.choices?.[0]?.message?.content || 'Action executed successfully!'

      if (chatId) {
        const updatedMessages = [
          ...messages,
          {
            role: 'assistant' as const,
            content: replyText,
            executedQueries
          }
        ]
        await saveChatSessionMessages(chatId, session.email, updatedMessages, apiKey)
      }

      return NextResponse.json({
        reply: replyText,
        executedQueries
      })
    }

    // 2. Normal assistant request
    const openrouterMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `SIGNED-IN SENDER PROFILE: Name: "${senderProfile.displayName}". Title: "${senderProfile.roleTitle}". Email: "${senderProfile.email}". When drafting an email, use this identity for any sign-off and never invent a different sender. The rendered email adds this saved signature automatically.`
      }
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
        openrouterMessages.push({
          role: 'system',
          content: `CONTEXT: The user is currently viewing the lead/inquiry record with ID: '${activeLeadId}'. If the user references 'this lead', 'them', 'this client', or asks you to create notes, tasks, or check details related to their screen, use this ID: '${activeLeadId}'.`
        })
      }
    }

    // Append conversation history
    openrouterMessages.push(...messages.slice(-15))

    let loopCount = 0
    const maxLoops = 5
    let finalContent = 'I encountered an issue processing your request.'
    let confirmationPayload: { query: string; summary: string } | null = null
    let textCampaignDraft: { name: string; bodyTemplate: string; campaignType: string } | null = null
    let emailDraftPayload: { recipientEmail: string; recipientName?: string; inquiryId?: string; subject: string; body: string; templateType?: string; senderProfile: LuxorUserProfile } | null = null
    let crmUpdatePayload: Record<string, unknown> | null = null
    let contractPayload: Record<string, unknown> | null = null
    let invoicePayload: Record<string, unknown> | null = null
    let taskPayload: Record<string, unknown> | null = null

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
          // A. Confirmation request
          if (toolCall.function?.name === 'request_action_confirmation') {
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
          // B. Normal database query
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
          // C. Safe text-campaign draft (no send or database write)
          else if (toolCall.function?.name === 'create_text_campaign_draft') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              const draftBody = String(args.bodyTemplate || '').trim().slice(0, 480)
              if (!/luxor event space/i.test(draftBody) || !/\bstop\b/i.test(draftBody)) {
                throw new Error('Draft must identify Luxor Event Space and include STOP instructions.')
              }
              textCampaignDraft = {
                name: String(args.name || 'Elena text campaign').trim().slice(0, 160),
                bodyTemplate: draftBody,
                campaignType: String(args.campaignType || 'elena'),
              }
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'create_text_campaign_draft',
                content: JSON.stringify({
                  ok: true,
                  message: 'Draft loaded into the Text Campaigns builder. The owner must review and explicitly queue it.',
                })
              })
            } catch (draftError) {
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'create_text_campaign_draft',
                content: JSON.stringify({
                  error: draftError instanceof Error ? draftError.message : 'Invalid text campaign draft.',
                })
              })
            }
          }
          // D. One-to-one text confirmation
          else if (toolCall.function?.name === 'request_text_message_confirmation') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              const body = String(args.body || '').trim()
              if (!body || body.length > 1600) throw new Error('The text must be between 1 and 1,600 characters.')
              confirmationPayload = {
                query: `SEND_TEXT:${JSON.stringify({
                  inquiryId: String(args.inquiryId || ''),
                  phone: String(args.phone || ''),
                  contactName: String(args.contactName || ''),
                  body,
                })}`,
                summary: String(args.summary || `Send a text to ${args.contactName || 'this client'}`),
              }
              confirmationInterrupted = true
            } catch (textError) {
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'request_text_message_confirmation',
                content: JSON.stringify({
                  error: textError instanceof Error ? textError.message : 'Invalid text message request.',
                })
              })
            }
          }
          // E. Interactive mini email draft
          else if (toolCall.function?.name === 'prepare_email_draft') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments

              emailDraftPayload = {
                recipientEmail: String(args.recipientEmail || ''),
                recipientName: String(args.recipientName || ''),
                inquiryId: String(args.inquiryId || ''),
                subject: String(args.subject || ''),
                body: String(args.body || '').replace(/\[(?:your\s+)?name\]/gi, senderProfile.displayName),
                templateType: args.templateType === 'marketing' ? 'marketing' : 'conversational',
                senderProfile,
              }

              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_email_draft',
                content: JSON.stringify({
                  ok: true,
                  message: 'Email draft card prepared and loaded into Elena Chat for inline editing and approval.'
                })
              })
            } catch (emailErr) {
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_email_draft',
                content: JSON.stringify({
                  error: emailErr instanceof Error ? emailErr.message : 'Invalid email draft request.'
                })
              })
            }
          }
          // F. CRM Update card
          else if (toolCall.function?.name === 'prepare_crm_update_card') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              crmUpdatePayload = args
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_crm_update_card',
                content: JSON.stringify({ ok: true, message: 'CRM Lead Update container loaded in Elena Chat.' })
              })
            } catch (err) {
              console.error(err)
            }
          }
          // G. Contract signature card
          else if (toolCall.function?.name === 'prepare_contract_card') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              contractPayload = args
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_contract_card',
                content: JSON.stringify({ ok: true, message: 'Contract Signature container loaded in Elena Chat.' })
              })
            } catch (err) {
              console.error(err)
            }
          }
          // H. Invoice & Payment link card
          else if (toolCall.function?.name === 'prepare_invoice_card') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              invoicePayload = args
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_invoice_card',
                content: JSON.stringify({ ok: true, message: 'Invoice & Payment Link container loaded in Elena Chat.' })
              })
            } catch (err) {
              console.error(err)
            }
          }
          // I. Task card
          else if (toolCall.function?.name === 'prepare_task_card') {
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              taskPayload = args
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'prepare_task_card',
                content: JSON.stringify({ ok: true, message: 'CRM Operational Task container loaded in Elena Chat.' })
              })
            } catch (err) {
              console.error(err)
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

    const updatedMessages = [
      ...messages,
      {
        role: 'assistant' as const,
        content: finalContent,
        executedQueries,
        confirmation: confirmationPayload || undefined,
        emailDraft: emailDraftPayload || undefined,
        crmUpdateCard: crmUpdatePayload || undefined,
        contractCard: contractPayload || undefined,
        invoiceCard: invoicePayload || undefined,
        taskCard: taskPayload || undefined
      }
    ]

    if (chatId) {
      const firstUserMsgObj = updatedMessages.find((m) => m.role === 'user')
      const firstUserMessage = firstUserMsgObj?.content || undefined

      await saveChatSessionMessages(chatId, session.email, updatedMessages, apiKey, firstUserMessage)
    }

    return NextResponse.json({
      reply: finalContent,
      confirmation: confirmationPayload || undefined,
      executedQueries,
      textCampaignDraft: textCampaignDraft || undefined,
      emailDraft: emailDraftPayload || undefined,
      crmUpdateCard: crmUpdatePayload || undefined,
      contractCard: contractPayload || undefined,
      invoiceCard: invoicePayload || undefined,
      taskCard: taskPayload || undefined
    })
  } catch (err: unknown) {
    console.error('Internal Elena API error:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
