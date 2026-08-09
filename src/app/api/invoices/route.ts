import { NextRequest, NextResponse } from 'next/server'
import { listInvoices, listInvoicesByInquiry, createInvoice, getInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorCatalogItem } from '@/lib/luxorServiceCatalog'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { queueInvoiceReminderTexts } from '@/lib/luxorTextCampaignsServer'
import { calculateLuxorOfferPricing, clampLuxorDiscountPercent, luxorOfferSnapshot } from '@/lib/luxorOffer'
import { expireLuxorCheckoutForRepricing } from '@/lib/luxorStripeCheckoutServer'
import { getLuxorBookingByInvoice, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getActiveLuxorSignatureRequestByBooking, getLuxorBookingContractFingerprint, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { createNote } from '@/lib/luxorNotesServer'

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
    const { client_name, event_type, description, line_items, tax_rate, due_date, inquiry_id, notes, discount_percent, offer_expires_at } = body

    if (!client_name || !line_items) {
      return NextResponse.json({ error: 'client_name and line_items are required.' }, { status: 400 })
    }

    const normalizedItems = (Array.isArray(line_items) ? line_items : []).map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1)
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0)
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 120) : crypto.randomUUID(),
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
    const discountPercent = clampLuxorDiscountPercent(discount_percent)
    const offerExpiresAt = offer_expires_at ? new Date(String(offer_expires_at)) : null
    if (offer_expires_at && (!offerExpiresAt || Number.isNaN(offerExpiresAt.getTime()))) {
      return NextResponse.json({ error: 'Choose a valid offer expiration date and time.' }, { status: 400 })
    }
    if (offerExpiresAt && offerExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The offer expiration must be in the future.' }, { status: 400 })
    }
    if (offerExpiresAt && offerExpiresAt.getTime() < Date.now() + 30 * 60_000) {
      return NextResponse.json({ error: 'Set the offer expiration at least 30 minutes ahead so Stripe can safely create a checkout session.' }, { status: 400 })
    }
    const pricing = calculateLuxorOfferPricing({ lineItems: normalizedItems, taxRate: normalizedTaxRate, discountPercent })

    const invoice = await createInvoice({
      client_name,
      event_type,
      description,
      line_items: normalizedItems,
      subtotal: pricing.subtotal,
      tax_rate: normalizedTaxRate,
      total: pricing.total,
      original_subtotal: pricing.originalSubtotal,
      original_total: pricing.originalTotal,
      discount_percent: pricing.discountPercent,
      discount_amount: pricing.discountAmount,
      offer_expires_at: offerExpiresAt?.toISOString() || null,
      due_date,
      inquiry_id,
      notes,
    })

    if (invoice.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(invoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(invoice, { phone: inquiry.phone, name: inquiry.full_name })
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

    const existing = await getInvoice(id)
    if (!existing) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    if (existing.status === 'paid') return NextResponse.json({ error: 'A paid invoice cannot be repriced.' }, { status: 409 })
    const offerTermsChanged = Array.isArray(updates.line_items) ||
      updates.tax_rate !== undefined ||
      updates.discount_percent !== undefined ||
      updates.offer_expires_at !== undefined
    const nextItems = Array.isArray(updates.line_items) ? updates.line_items : existing.line_items
    const nextTaxRate = updates.tax_rate === undefined ? Number(existing.tax_rate || 0) : Math.min(1, Math.max(0, Number(updates.tax_rate) || 0))
    const nextDiscountPercent = updates.discount_percent === undefined ? Number(existing.discount_percent || 0) : clampLuxorDiscountPercent(updates.discount_percent)
    if (Array.isArray(updates.line_items) || updates.tax_rate !== undefined || updates.discount_percent !== undefined) {
      const pricing = calculateLuxorOfferPricing({ lineItems: nextItems, taxRate: nextTaxRate, discountPercent: nextDiscountPercent })
      updates.line_items = nextItems
      updates.tax_rate = nextTaxRate
      updates.subtotal = pricing.subtotal
      updates.total = pricing.total
      updates.original_subtotal = pricing.originalSubtotal
      updates.original_total = pricing.originalTotal
      updates.discount_percent = pricing.discountPercent
      updates.discount_amount = pricing.discountAmount
    }
    if (updates.offer_expires_at) {
      const expiry = new Date(String(updates.offer_expires_at))
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now() + 30 * 60_000) {
        return NextResponse.json({ error: 'Set the offer expiration at least 30 minutes ahead.' }, { status: 400 })
      }
      updates.offer_expires_at = expiry.toISOString()
    }

    if (offerTermsChanged && existing.stripe_checkout_session_id) {
      await expireLuxorCheckoutForRepricing(existing)
    }

    const updatedInvoice = await updateInvoice(id, updates)
    if (updatedInvoice && offerTermsChanged) {
      const booking = await getLuxorBookingByInvoice(updatedInvoice.id)
      if (booking) {
        const refreshedBooking = await updateLuxorBooking(booking.id, {
          contract_total: Number(updatedInvoice.total || 0),
          metadata: {
            ...booking.metadata,
            proposalLineItems: updatedInvoice.line_items,
            proposalTaxRate: Number(updatedInvoice.tax_rate || 0),
            proposalOffer: luxorOfferSnapshot(updatedInvoice),
          },
        }) || booking
        const activeAgreement = await getActiveLuxorSignatureRequestByBooking(refreshedBooking.id)
        if (activeAgreement && activeAgreement.metadata?.bookingFingerprint !== getLuxorBookingContractFingerprint(refreshedBooking)) {
          const invalidatedAt = new Date().toISOString()
          await updateLuxorSignatureRequest(activeAgreement.id, {
            status: 'void',
            expires_at: invalidatedAt,
            metadata: {
              ...(activeAgreement.metadata || {}),
              invalidatedAt,
              invalidatedReason: 'Proposal financial terms changed before signature.',
            },
          })
          await recordLuxorSignatureEvent({
            signatureRequestId: activeAgreement.id,
            eventType: 'invalidated',
            metadata: { reason: 'Proposal financial terms changed before signature.' },
          })
          await updateLuxorBooking(refreshedBooking.id, { contract_status: 'void' })
          if (refreshedBooking.inquiry_id) {
            await createNote(refreshedBooking.inquiry_id, 'Unsigned agreement invalidated because proposal financial terms changed. Send a new agreement before the client signs.', 'status_change', session.email)
          }
        }
      }
    }
    if (updatedInvoice?.inquiry_id) {
      try {
        const inquiry = await getLuxorInquiry(updatedInvoice.inquiry_id)
        if (inquiry) {
          await queueInvoiceReminderTexts(updatedInvoice, { phone: inquiry.phone, name: inquiry.full_name })
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
