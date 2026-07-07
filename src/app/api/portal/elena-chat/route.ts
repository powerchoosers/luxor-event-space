import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

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

const SYSTEM_PROMPT = `You are Elena, the internal AI concierge, COO, CFO, Chief of Marketing, and business mentor all-in-one for the Luxor Event Space Owner Portal.

Your personality is that of a warm, supportive, and slightly playful "girl best friend" (using words like "bestie", "girl", "hey", "let's do this!", "we've got this") but you are a "tamed" assistant—meaning you remain highly intelligent, precise, and completely focused on executive operations, financial analysis, and strategic growth.

Your primary role is to help the venue owner run the business. You analyze numbers (like a CFO), manage operational statuses and tasks (like a COO), brainstorm growth ideas (like a Chief of Marketing), and provide strategic guidance (like a Mentor).

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

### GUIDELINES:
- Execute read-only SQL queries (using SELECT statements) to lookup info.
- If the user asks you to perform write operations (like updating a task status, adding a follow-up note, or modifying a booking date), you are authorized to run INSERT, UPDATE, or DELETE statements because this is an internal secure workspace.
- Always double check spelling (e.g. use Quinceañera or Quinceañeras with the Spanish "ñ" if searching text fields, but keep query structures precise).
- If your query returns no results, check if you matched the casing or exact spelling.
- Present answers in a clean, readable layout (use markdown tables or bulleted lists for query results).
- Limit output results when necessary (e.g. "LIMIT 10" or "LIMIT 5") to avoid blowing up context, unless requested.
- Maintain your warm "girl best friend" executive/mentor personality. Use emojis naturally (e.g. 💅, 📈, 💕, ✨, 💁‍♀️) but do not overdo it. Always give valuable, executive-level business advice and mentorship based on the data you find.`

const TOOLS_DEFINITION = [
  {
    type: 'function',
    function: {
      name: 'execute_database_sql',
      description: 'Run SQL statements against the venue database. Supports SELECT, INSERT, UPDATE, and DELETE. Tables are under the public schema, prefix them with "public." e.g. public.luxor_inquiries.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The exact SQL query to execute in PostgreSQL.'
          }
        },
        required: ['query']
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

    const { messages } = (await request.json()) as { messages?: ChatMessage[] }
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages body' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OpenRouter API key' }, { status: 500 })
    }

    // Build standard message list
    const openrouterMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-15) // Keep last 15 messages for context
    ]

    const executedQueries: Array<{ query: string; result: unknown }> = []

    let loopCount = 0
    const maxLoops = 5
    let finalContent = 'I encountered an issue processing your request.'

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

      // Append assistant's reply (including any tool calls) to message history
      openrouterMessages.push(assistantMessage)

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Execute tool call(s)
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.function?.name === 'execute_database_sql') {
            let sqlQuery = ''
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments
              sqlQuery = args.query
            } catch (err) {
              console.error('Failed to parse tool call args:', err)
            }

            if (sqlQuery) {
              let queryResult: unknown
              try {
                // Call RPC function exec_sql
                const rpcRes = await supabaseRest<unknown>('rpc/exec_sql', {
                  method: 'POST',
                  body: JSON.stringify({ query: sqlQuery })
                })
                
                queryResult = rpcRes
                executedQueries.push({ query: sqlQuery, result: rpcRes })
              } catch (dbErr: unknown) {
                console.error('Database query failed:', dbErr)
                const dbErrMsg = dbErr instanceof Error ? dbErr.message : 'Database query failed'
                queryResult = { error: dbErrMsg }
                executedQueries.push({ query: sqlQuery, result: queryResult })
              }

              // Append tool response
              openrouterMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: 'execute_database_sql',
                content: JSON.stringify(queryResult)
              })
            }
          }
        }
      } else {
        // No tool calls, this is the final response
        finalContent = assistantMessage.content || ''
        break
      }
    }

    return NextResponse.json({
      reply: finalContent,
      executedQueries
    })
  } catch (err: unknown) {
    console.error('Internal Elena API error:', err)
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
