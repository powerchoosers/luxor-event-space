import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { NextResponse } from 'next/server'

interface InquiryRecord {
  id: string
  full_name: string
  event_type: string | null
  status: string
  pipeline_stage?: string
  tour_date?: string | null
}

interface BookingRecord {
  id: string
  client_name: string
  event_type?: string
  contract_total?: number
  deposit_required?: number
  contract_status?: string
}

interface InvoiceRecord {
  id: string
  client_name: string
  total: number
  status: string
}

interface TaskRecord {
  id: string
  title: string
  priority?: string
  status?: string
}

interface InventoryRecord {
  id: string
  name: string
  status: string
}

export async function GET(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const activePath = searchParams.get('activePath') || ''
    const apiKey = process.env.OPEN_ROUTER_API_KEY

    // Fetch live CRM snapshots in parallel
    const [inquiries, bookings, invoices, tasks, inventory] = await Promise.all([
      supabaseRest<InquiryRecord[]>('luxor_inquiries?select=id,full_name,event_type,status,pipeline_stage,tour_date&order=created_at.desc&limit=4').catch(() => []),
      supabaseRest<BookingRecord[]>('luxor_bookings?select=id,client_name,event_type,contract_total,deposit_required,contract_status&order=updated_at.desc&limit=4').catch(() => []),
      supabaseRest<InvoiceRecord[]>('luxor_invoices?select=id,client_name,total,status&status=neq.paid&order=created_at.desc&limit=4').catch(() => []),
      supabaseRest<TaskRecord[]>('luxor_tasks?select=id,title,priority,status&status=eq.pending&limit=4').catch(() => []),
      supabaseRest<InventoryRecord[]>('luxor_inventory?select=id,name,status&status=in.("Low","Out of Stock")&limit=4').catch(() => []),
    ])

    const crmSnapshot = {
      activeRoute: activePath,
      recentInquiries: inquiries.map(i => ({ name: i.full_name, event: i.event_type, stage: i.pipeline_stage, status: i.status })),
      recentBookings: bookings.map(b => ({ name: b.client_name, event: b.event_type, contractStatus: b.contract_status, deposit: b.deposit_required })),
      unpaidInvoices: invoices.map(v => ({ client: v.client_name, amount: v.total, status: v.status })),
      pendingTasks: tasks.map(t => ({ title: t.title, priority: t.priority })),
      lowStockInventory: inventory.map(i => ({ item: i.name, status: i.status }))
    }

    // Try AI generation for fresh dynamic cycling suggestions
    if (apiKey) {
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://luxoreventspace.com',
            'X-Title': 'Elena Dynamic Suggestions Engine',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.85, // Higher temperature for diverse cycling
            messages: [
              {
                role: 'system',
                content: `You are Elena, COO & Chief Concierge of Luxor Event Space. Generate exactly 4 distinct, fresh, highly useful prompt suggestions for the business owner based on the provided live CRM snapshot.

GUIDELINES FOR SUGGESTIONS:
- Each suggestion MUST be short (under 75 characters) and directly usable as a read-only question in Elena Chat.
- Prefer questions that help the owner understand what needs attention before taking action.
- Do not suggest sending, drafting, scheduling, creating, updating, deleting, or preparing anything.
- Cover 4 distinct areas: lead follow-up, upcoming bookings, money owed or bills, and operations/tasks/inventory.
- Good examples: "Which inquiries need follow-up this week?", "What is our next event and what remains?", "What money needs attention today?", "Show overdue tasks and low-stock items."
- You MUST respond ONLY with a valid JSON array of 4 strings. No markdown formatting, backticks, or explanation.
Example output format:
["Which inquiries need follow-up this week?", "What is our next event and what remains?", "What money needs attention today?", "Show overdue tasks and low-stock items"]`
              },
              {
                role: 'user',
                content: `Current Live CRM Snapshot:\n${JSON.stringify(crmSnapshot, null, 2)}`
              }
            ]
          })
        })

        if (aiRes.ok) {
          const aiData = await aiRes.json()
          let rawText = (aiData.choices?.[0]?.message?.content || '').trim()
          if (rawText.includes('```')) {
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim()
          }
          const parsed = JSON.parse(rawText) as string[]
          if (Array.isArray(parsed) && parsed.length >= 3) {
            const safeSuggestions = parsed
              .filter((suggestion): suggestion is string => typeof suggestion === 'string')
              .filter((suggestion) => !/\b(send|draft|schedule|create|update|delete|prepare|text|email|payment link|signature link)\b/i.test(suggestion))
              .map((suggestion) => suggestion.trim().slice(0, 75))
              .filter(Boolean)
            if (safeSuggestions.length >= 3) {
              return NextResponse.json({ suggestions: safeSuggestions.slice(0, 4) })
            }
          }
        }
      } catch (aiErr) {
        console.error('AI suggestions error, falling back:', aiErr)
      }
    }

    // Fallback: Build structured dynamic prompts from CRM snapshot
    const fallbackSuggestions: string[] = []

    if (inquiries.length > 0 && inquiries[0].full_name) {
      fallbackSuggestions.push(`What does ${inquiries[0].full_name} need next?`)
    }
    if (bookings.length > 0 && bookings[0].client_name) {
      fallbackSuggestions.push(`What remains for ${bookings[0].client_name}?`)
    }
    if (invoices.length > 0 && invoices[0].client_name) {
      fallbackSuggestions.push(`What is still owed by ${invoices[0].client_name}?`)
    }
    if (tasks.length > 0 && tasks[0].title) {
      fallbackSuggestions.push(`Show overdue tasks and low-stock items`)
    }

    if (fallbackSuggestions.length < 4) {
      fallbackSuggestions.push('Show upcoming venue bookings for this month')
      fallbackSuggestions.push('Check active venue inquiries')
      fallbackSuggestions.push('What money needs attention today?')
    }

    return NextResponse.json({ suggestions: Array.from(new Set(fallbackSuggestions)).slice(0, 4) })
  } catch (err: unknown) {
    console.error('Failed to generate smart suggestions:', err)
    return NextResponse.json({
      suggestions: [
        'Show upcoming venue bookings',
        'Check active venue inquiries',
        'What is our invoice revenue this year?'
      ]
    })
  }
}
