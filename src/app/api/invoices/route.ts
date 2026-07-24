import { NextRequest, NextResponse } from 'next/server'
import { listInvoices, listInvoicesByInquiry, createInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorCatalogItem } from '@/lib/luxorServiceCatalog'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'

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

    const invoices = await listInvoices(1000)
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
    const { client_name, event_type, description, line_items, tax_rate, due_date, inquiry_id, notes } = body

    if (!client_name || !line_items) {
      return NextResponse.json({ error: 'client_name and line_items are required.' }, { status: 400 })
    }

    const normalizedItems = (Array.isArray(line_items) ? line_items : []).map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1)
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0)
      return {
        ...(typeof item.catalogId === 'string' ? { catalogId: item.catalogId } : {}),
        ...(typeof item.category === 'string' ? { category: item.category } : {}),
        ...(item.included === true ? { included: true } : {}),
        description: String(item.description || '').trim(),
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      }
    }).filter((item) => item.description)
    if (!normalizedItems.length) return NextResponse.json({ error: 'At least one line item is required.' }, { status: 400 })
    for (const item of normalizedItems) {
      const catalogItem = getLuxorCatalogItem(item.catalogId)
      if (catalogItem?.requiresCustomPrice && item.unitPrice <= 0) {
        return NextResponse.json({ error: `${item.description} needs an agreed price before the proposal can be created.` }, { status: 400 })
      }
      if (catalogItem?.minimumCharge && item.total + 0.005 < catalogItem.minimumCharge) {
        return NextResponse.json({ error: `${item.description} has a ${catalogItem.minimumCharge.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} minimum.` }, { status: 400 })
      }
    }
    const normalizedTaxRate = Math.min(1, Math.max(0, Number(tax_rate) || 0))
    const subtotal = Math.round(normalizedItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100
    const total = Math.round(subtotal * (1 + normalizedTaxRate) * 100) / 100

    const invoice = await createInvoice({
      client_name,
      event_type,
      description,
      line_items: normalizedItems,
      subtotal,
      tax_rate: normalizedTaxRate,
      total,
      due_date,
      inquiry_id,
      notes,
    })

    if (invoice.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(invoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(invoice, { phone: inquiry.phone, name: inquiry.name })
        }
      } catch (automationError) {
        console.error('Invoice created, but its text reminders could not be queued:', automationError)
      }
    }

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
    if (updatedInvoice?.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(updatedInvoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(updatedInvoice, { phone: inquiry.phone, name: inquiry.name })
        }
      } catch (automationError) {
        console.error('Invoice updated, but its text reminders could not be queued:', automationError)
      }
    }
    return NextResponse.json(updatedInvoice)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update invoice.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
