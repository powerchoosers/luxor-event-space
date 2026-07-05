import { NextRequest, NextResponse } from 'next/server'
import { listInvoices, listInvoicesByInquiry, createInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (inquiryId) {
      const invoices = await listInvoicesByInquiry(inquiryId)
      return NextResponse.json(invoices)
    }

    const invoices = await listInvoices(100)
    return NextResponse.json(invoices)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch invoices.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { client_name, event_type, description, line_items, subtotal, tax_rate, total, due_date, inquiry_id, notes } = body

    if (!client_name || !line_items) {
      return NextResponse.json({ error: 'client_name and line_items are required.' }, { status: 400 })
    }

    const invoice = await createInvoice({
      client_name,
      event_type,
      description,
      line_items,
      subtotal,
      tax_rate,
      total,
      due_date,
      inquiry_id,
      notes,
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Invoice id is required.' }, { status: 400 })
    }

    const updatedInvoice = await updateInvoice(id, updates)
    return NextResponse.json(updatedInvoice)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update invoice.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
