import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { NextResponse } from 'next/server'

interface InquiryRecord {
  id: string
  full_name: string
  event_type: string | null
  status: string
  tour_date: string | null
}

interface InvoiceRecord {
  id: string
  client_name: string
  total: number
  status: string
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

    const suggestions: string[] = []

    // 1. Check latest inquiry
    try {
      const recentInquiries = await supabaseRest<InquiryRecord[]>(
        'luxor_inquiries?select=id,full_name,event_type,status,tour_date&order=created_at.desc&limit=3'
      )
      if (recentInquiries && recentInquiries.length > 0) {
        const latest = recentInquiries[0]
        if (latest.full_name) {
          suggestions.push(`List details of recent inquiry from ${latest.full_name}`)
        }
        const tourScheduled = recentInquiries.find((i) => i.status === 'tour_scheduled' || i.tour_date)
        if (tourScheduled) {
          suggestions.push(`Check upcoming tour schedule for ${tourScheduled.full_name}`)
        } else {
          suggestions.push(`Show all active venue inquiries in pipeline`)
        }
      }
    } catch {
      // Fallback handled below
    }

    // 2. Check invoices / finances
    try {
      const unpaidInvoices = await supabaseRest<InvoiceRecord[]>(
        'luxor_invoices?select=id,client_name,total,status&status=neq.paid&limit=5'
      )
      if (unpaidInvoices && unpaidInvoices.length > 0) {
        const totalAmount = unpaidInvoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0)
        const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalAmount)
        suggestions.push(`Review ${unpaidInvoices.length} unpaid invoices totaling ${formattedTotal}`)
      }
    } catch {
      // Fallback
    }

    // 3. Check inventory status
    try {
      const lowStock = await supabaseRest<InventoryRecord[]>(
        'luxor_inventory?select=id,name,status&status=in.("Low","Out of Stock")&limit=5'
      )
      if (lowStock && lowStock.length > 0) {
        suggestions.push(`Check ${lowStock.length} inventory items flagged Low or Out of Stock`)
      }
    } catch {
      // Fallback
    }

    // Contextual Fallbacks if database queries return fewer than 3 items
    if (suggestions.length < 3) {
      if (activePath.startsWith('/portal/leads')) {
        suggestions.push('Show recent follow-up notes for active leads')
        suggestions.push('Check active leads pipeline stage counts')
      } else if (activePath.startsWith('/portal/calendar') || activePath.startsWith('/portal/events')) {
        suggestions.push('Show upcoming bookings for this month')
        suggestions.push('Are there any tours scheduled this week?')
      } else if (activePath.startsWith('/portal/finances')) {
        suggestions.push('What is our total revenue from invoices this year?')
        suggestions.push('List recent booking deposits and expenses')
      } else if (activePath.startsWith('/portal/marketing')) {
        suggestions.push('Show open rates of active email campaigns')
        suggestions.push('Check marketing list subscriber count')
      } else {
        suggestions.push('Show upcoming venue bookings for this month')
        suggestions.push('Check active venue inquiries')
      }
    }

    // Return unique top 4 suggestions
    const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, 4)

    return NextResponse.json({ suggestions: uniqueSuggestions })
  } catch (err: unknown) {
    console.error('Failed to generate smart suggestions:', err)
    return NextResponse.json({
      suggestions: [
        'Show upcoming venue bookings',
        'Check active venue inquiries',
        'What is our revenue from invoices?'
      ]
    })
  }
}
