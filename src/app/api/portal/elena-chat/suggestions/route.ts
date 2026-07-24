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
                content: `You are Elena, COO & Chief Concierge of Luxor Event Space. Generate exactly 4 distinct, fresh, highly actionable prompt suggestions for the business owner based on the provided live CRM snapshot.

GUIDELINES FOR SUGGESTIONS:
- Each suggestion MUST be short (under 75 characters) and 9/10 executable in Elena Chat.
- Make them specific by referencing real client names, exact invoice amounts, or event types from the snapshot if available.
- Cover 4 distinct action areas:
  1. Direct Email/SMS action (e.g., "Draft tour confirmation email for [Client]" or "Send SMS update to [Client]")
  2. Contract/Invoice action (e.g., "Send contract signature link to [Client]" or "Send payment link for [Client] invoice")
  3. CRM Field Update/Task action (e.g., "Update pipeline stage for [Client] to Booked" or "Create task to check catering")
  4. Revenue/Analytics query (e.g., "Show unpaid invoice totals this month" or "Check low stock inventory items")
- You MUST respond ONLY with a valid JSON array of 4 strings. No markdown formatting, backticks, or explanation.
Example output format:
["Draft tour follow-up email for Sarah Smith", "Send contract signature link to Alex Johnson", "Update pipeline stage for Sarah to Booked", "Show total unpaid invoice balances"]`
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
            return NextResponse.json({ suggestions: parsed.slice(0, 4) })
          }
        }
      } catch (aiErr) {
        console.error('AI suggestions error, falling back:', aiErr)
      }
    }

    // Fallback: Build structured dynamic prompts from CRM snapshot
    const fallbackSuggestions: string[] = []

    if (inquiries.length > 0 && inquiries[0].full_name) {
      fallbackSuggestions.push(`Draft tour follow-up email for ${inquiries[0].full_name}`)
    }
    if (bookings.length > 0 && bookings[0].client_name) {
      fallbackSuggestions.push(`Send contract signature link to ${bookings[0].client_name}`)
    }
    if (invoices.length > 0 && invoices[0].client_name) {
      fallbackSuggestions.push(`Send payment link to ${invoices[0].client_name} ($${invoices[0].total})`)
    }
    if (tasks.length > 0 && tasks[0].title) {
      fallbackSuggestions.push(`Review pending task: ${tasks[0].title}`)
    }

    if (fallbackSuggestions.length < 4) {
      fallbackSuggestions.push('Show upcoming venue bookings for this month')
      fallbackSuggestions.push('Check active venue inquiries')
      fallbackSuggestions.push('What is our invoice revenue this year?')
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
