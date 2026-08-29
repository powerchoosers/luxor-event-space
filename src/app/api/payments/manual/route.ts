import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import {
  ensureLuxorDepositInvoice,
  ensureLuxorFinalBalanceInvoice,
  ensureLuxorSecurityDepositInvoice,
  getInvoice,
  listPaidPaymentsByInvoice,
  luxorFinalPaymentDueDate,
  updateInvoice,
} from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { queuePaymentConfirmationText } from '@/lib/luxorTextCampaignsServer'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from '@/lib/luxorBookingMoney'
import { expireLuxorCheckoutForRepricing } from '@/lib/luxorStripeCheckoutServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { luxorCollectionAmounts } from '@/lib/luxorPaymentOwnership'
import type { LuxorInvoice, LuxorPayment } from '@/lib/luxorInquiryTypes'
import { broadcastLuxorPortalNotification } from '@/lib/luxorZohoWebhookServer'

type ManualPaymentKind = 'deposit' | 'final' | 'security_deposit'

const MONEY_EPSILON = 0.005

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function paidTotal(payments: LuxorPayment[]) {
  return roundMoney(payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
}

function invoiceBalance(invoice: LuxorInvoice, payments: LuxorPayment[]) {
  return Math.max(0, roundMoney(Number(invoice.total || 0) - paidTotal(payments)))
}

function securityDepositAmount(invoice: LuxorInvoice) {
  const line = invoice.line_items.find((item) =>
    item.paymentBucket === 'security_deposit' ||
    item.category === 'Security Deposit' ||
    /refundable\s+security\s+deposit/i.test(item.description || ''),
  )
  return roundMoney(Number(line?.total || 0))
}

function paymentMethod(value: unknown) {
  const method = String(value || 'manual').toLowerCase()
  if (method === 'zelle') return 'Zelle'
  if (method === 'cash') return 'Cash'
  if (method === 'check') return 'Check'
  return 'Manual record'
}

function paymentMetadata(kind: ManualPaymentKind, invoice: LuxorInvoice, preferredMethod: unknown) {
  const securityDeposit = kind === 'deposit' ? securityDepositAmount(invoice) : 0
  const initialBookingPayment = kind === 'deposit'
    ? Math.max(0, roundMoney(Number(invoice.total || 0) - securityDeposit))
    : 0

  return {
    payment_kind: kind,
    manual_entry: true,
    payment_method_selected: String(preferredMethod || 'manual').toLowerCase(),
    ...(kind === 'deposit' ? {
      initial_booking_payment: initialBookingPayment,
      refundable_security_deposit: securityDeposit,
    } : {}),
  }
}

function configuredFinalPaymentDueDate(booking: Awaited<ReturnType<typeof getLuxorBooking>>) {
  if (!booking) return null
  const dueDate = booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date)
  return typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null
}

async function ensureConfiguredFinalBalanceInvoice(booking: NonNullable<Awaited<ReturnType<typeof getLuxorBooking>>>, masterInvoice: LuxorInvoice) {
  const dueDate = configuredFinalPaymentDueDate(booking)
  if (!dueDate) return null
  return ensureLuxorFinalBalanceInvoice({
    masterInvoice,
    bookingId: booking.id,
    dueDate,
    depositPaid: Number(booking.deposit_required || 0),
    securityDepositAmount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
  })
}

async function resolveManualPaymentInvoice(bookingId: string, kind: ManualPaymentKind) {
  const booking = await getLuxorBooking(bookingId)
  if (!booking) throw new Error('Booking record not found.')
  if (booking.contract_status !== 'signed') {
    throw new Error('The Event Agreement must be signed before any booking payment can be recorded.')
  }

  const masterInvoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
  if (!masterInvoice || masterInvoice.invoice_kind !== 'event') {
    throw new Error('This signed booking needs its finalized event proposal before a payment can be recorded.')
  }

  const securityDueDate = booking.event_date
    ? (() => { const date = new Date(`${booking.event_date}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 30); return date.toISOString().slice(0, 10) })()
    : new Date().toISOString().slice(0, 10)
  const securityInvoice = await ensureLuxorSecurityDepositInvoice({ masterInvoice, bookingId: booking.id, dueDate: securityDueDate })
  if (kind === 'security_deposit') return { booking, masterInvoice, invoice: securityInvoice }

  const depositInvoice = await ensureLuxorDepositInvoice({
    masterInvoice,
    bookingId: booking.id,
    dueDate: booking.contract_signed_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    reservationDepositAmount: booking.deposit_required,
  })
  if (kind === 'deposit') return { booking, masterInvoice, invoice: depositInvoice }

  const depositPayments = await listPaidPaymentsByInvoice(depositInvoice.id)
  if (invoiceBalance(depositInvoice, depositPayments) > MONEY_EPSILON) {
    throw new Error('Record the initial booking payment and refundable security deposit before recording the final event balance.')
  }

  const invoice = await ensureConfiguredFinalBalanceInvoice(booking, masterInvoice)
  if (!invoice) {
    throw new Error('The approved proposal is missing its final payment due date. Add it before recording the final event balance.')
  }
  if (securityDepositAmount(invoice) > MONEY_EPSILON) {
    throw new Error('The final event balance must not include the refundable security deposit.')
  }

  return { booking, masterInvoice, invoice }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as {
      bookingId?: string
      paymentKind?: ManualPaymentKind
      paymentMethod?: string
    }
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId : ''
    const kind: ManualPaymentKind | null = body.paymentKind === 'deposit' || body.paymentKind === 'final' || body.paymentKind === 'security_deposit'
      ? body.paymentKind
      : null
    if (!bookingId || !kind) {
      return NextResponse.json({ error: 'bookingId and paymentKind are required.' }, { status: 400 })
    }

    // Check this before the helper can create a deposit/final invoice. A lost
    // lead may retain historic paid records, but it must not gain a new manual
    // receipt or a fresh payment document.
    const requestedBooking = await getLuxorBooking(bookingId)
    if (!requestedBooking) return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 })
    const requestedInquiryId = requestedBooking.inquiry_id || null
    const requestedInquiry = requestedInquiryId ? await getLuxorInquiry(requestedInquiryId) : null
    if (requestedBooking.status === 'cancelled' || requestedInquiry?.status === 'closed_lost') {
      return NextResponse.json({ error: 'This deal is closed lost or its booking is cancelled. Do not record a new payment; review any historic payment in Stripe or the ledger instead.' }, { status: 409 })
    }

    const { booking, masterInvoice, invoice } = await resolveManualPaymentInvoice(bookingId, kind)
    const luxorOnlyCollection = luxorCollectionAmounts(masterInvoice).scoped
    const inquiryId = booking.inquiry_id || masterInvoice.inquiry_id || null
    const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
    if (booking.status === 'cancelled' || masterInvoice.status === 'cancelled' || inquiry?.status === 'closed_lost') {
      return NextResponse.json({ error: 'This deal was closed while the payment was being prepared. No manual payment was recorded.' }, { status: 409 })
    }
    const existingPayments = await listPaidPaymentsByInvoice(invoice.id)
    const amount = invoiceBalance(invoice, existingPayments)
    const now = new Date().toISOString()

    if (amount <= MONEY_EPSILON) {
      const finalBalanceInvoice = kind === 'deposit'
        ? await ensureConfiguredFinalBalanceInvoice(booking, masterInvoice)
        : null
      const finalPaymentScheduleMissing = kind === 'deposit' && !finalBalanceInvoice && !configuredFinalPaymentDueDate(booking)
      const bookingUpdate = kind === 'security_deposit'
        ? {
          security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
          security_deposit_status: 'held' as const,
          metadata: {
            ...booking.metadata,
            security_deposit_collected_at: booking.metadata?.security_deposit_collected_at || now,
            security_deposit_held_at: booking.metadata?.security_deposit_held_at || now,
            security_deposit_payment_invoice_id: invoice.id,
          },
        }
        : kind === 'deposit'
        ? {
          status: 'confirmed' as const,
          security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
          security_deposit_status: 'held',
          metadata: {
            ...booking.metadata,
            deposit_paid_at: booking.metadata?.deposit_paid_at || now,
            security_deposit_collected_at: booking.metadata?.security_deposit_collected_at || now,
            security_deposit_held_at: booking.metadata?.security_deposit_held_at || now,
            security_deposit_payment_invoice_id: invoice.id,
            reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || now,
            reservation_state: 'confirmed',
            ...(finalBalanceInvoice ? { final_balance_invoice_id: finalBalanceInvoice.id } : {}),
            ...(finalPaymentScheduleMissing ? {
              final_payment_schedule_configuration_required_at: booking.metadata?.final_payment_schedule_configuration_required_at || now,
            } : {}),
          },
        }
        : {
          metadata: {
            ...booking.metadata,
            ...(luxorOnlyCollection ? { luxor_services_paid_at: booking.metadata?.luxor_services_paid_at || now, luxor_services_payment_invoice_id: invoice.id } : { final_payment_paid_at: booking.metadata?.final_payment_paid_at || now }),
            final_payment_recorded_manually_at: booking.metadata?.final_payment_recorded_manually_at || now,
            final_payment_invoice_id: invoice.id,
          },
      }
      const updatedBooking = await updateLuxorBooking(booking.id, bookingUpdate)
      if (kind === 'deposit' && booking.status !== 'confirmed' && updatedBooking?.status === 'confirmed') {
        await broadcastLuxorPortalNotification('booking-confirmed', { bookingId: updatedBooking.id, inquiryId })
          .catch((error) => console.error('Booking was confirmed, but portal notification broadcast failed:', error))
      }
      return NextResponse.json({ invoice, booking: updatedBooking || booking, alreadyPaid: true })
    }

    // A manual receipt replaces, rather than competes with, an outstanding
    // Stripe link. Expire that link first so the same invoice cannot be paid
    // twice after an owner records a cash, check, or Zelle payment.
    if (invoice.stripe_checkout_session_id) {
      await expireLuxorCheckoutForRepricing(invoice)
    }

    const [payment] = await supabaseRest<LuxorPayment[]>('luxor_payments?on_conflict=processor,processor_reference&select=*', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        inquiry_id: booking.inquiry_id || masterInvoice.inquiry_id || null,
        booking_id: booking.id,
        invoice_id: invoice.id,
        amount,
        status: 'paid',
        payment_method: paymentMethod(body.paymentMethod),
        paid_at: now,
        processor: 'manual',
        processor_reference: 'manual:' + invoice.id + ':full-balance',
        notes: kind === 'security_deposit'
          ? 'Separate $750 refundable security deposit recorded manually in owner portal.'
          : kind === 'deposit'
          ? 'Initial booking payment recorded manually in owner portal. The separate refundable security deposit remains due 30 days before the event.'
          : 'Final Event Price balance recorded manually in owner portal. The refundable security deposit remains held separately.',
        metadata: paymentMetadata(kind, invoice, body.paymentMethod),
      }),
    })
    if (!payment) throw new Error('Payment record could not be created.')

    const updatedInvoice = await updateInvoice(invoice.id, { status: 'paid', paid_at: now }) || invoice
    const finalBalanceInvoice = kind === 'deposit'
      ? await ensureConfiguredFinalBalanceInvoice(booking, masterInvoice)
      : null
    const finalPaymentScheduleMissing = kind === 'deposit' && !finalBalanceInvoice && !configuredFinalPaymentDueDate(booking)
    const updatedBooking = await updateLuxorBooking(booking.id, kind === 'security_deposit'
      ? {
        security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
        security_deposit_status: 'held',
        metadata: {
          ...booking.metadata,
          security_deposit_collected_at: now,
          security_deposit_held_at: now,
          security_deposit_payment_invoice_id: invoice.id,
        },
      }
      : kind === 'deposit'
      ? {
        status: 'confirmed',
        security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
        security_deposit_status: 'held',
        metadata: {
          ...booking.metadata,
          deposit_paid_at: now,
          security_deposit_collected_at: now,
          security_deposit_held_at: now,
          security_deposit_payment_invoice_id: invoice.id,
          reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || now,
          reservation_state: 'confirmed',
          ...(finalBalanceInvoice ? { final_balance_invoice_id: finalBalanceInvoice.id } : {}),
          ...(finalPaymentScheduleMissing ? {
            final_payment_schedule_configuration_required_at: booking.metadata?.final_payment_schedule_configuration_required_at || now,
          } : {}),
        },
      }
      : {
        metadata: {
          ...booking.metadata,
            ...(luxorOnlyCollection ? { luxor_services_paid_at: now, luxor_services_payment_invoice_id: invoice.id } : { final_payment_paid_at: now }),
          final_payment_recorded_manually_at: now,
          final_payment_invoice_id: invoice.id,
        },
      })

    if (kind === 'deposit' && booking.status !== 'confirmed' && updatedBooking?.status === 'confirmed') {
      await broadcastLuxorPortalNotification('booking-confirmed', { bookingId: updatedBooking.id, inquiryId })
        .catch((error) => console.error('Booking was confirmed, but portal notification broadcast failed:', error))
    }

    if (inquiryId) {
      if (inquiry) {
        await updateLuxorInquiry(inquiry.id, {
          status: 'booked',
          pipeline_stage: kind === 'deposit' ? 'planning' : luxorOnlyCollection ? 'final_payment' : 'event',
          metadata: {
            ...inquiry.metadata,
            latest_payment_at: now,
            latest_paid_invoice_id: invoice.id,
          },
        })
      }
      await createNote(
        inquiryId,
        kind === 'security_deposit'
          ? 'The separate $750 refundable security deposit was recorded manually for ' + booking.client_name + ' and is held through post-event inspection.'
          : kind === 'deposit'
          ? finalPaymentScheduleMissing
            ? 'Initial booking payment recorded manually for ' + booking.client_name + '. The separate $750 refundable security deposit remains due 30 days before the event, but the approved proposal is missing its final payment due date. Configure that date before sending the final balance request.'
            : 'Initial booking payment recorded manually for ' + booking.client_name + '. The separate $750 refundable security deposit remains due 30 days before the event.'
          : 'Final Event Price balance recorded manually for ' + booking.client_name + '. The $750 refundable security deposit remains held separately.',
        'status_change',
        session.email,
      )
    }

    try {
      await queuePaymentConfirmationText(payment, {
        phone: inquiry?.phone || booking.phone,
        name: inquiry?.full_name || booking.client_name || 'there',
        inquiryId,
      })
    } catch (automationError) {
      console.error('Manual payment saved, but its text confirmation could not be queued:', automationError)
    }

    return NextResponse.json({ payment, invoice: updatedInvoice, booking: updatedBooking || booking }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record manual payment.'
    const status = /must be signed|before recording|needs its finalized|missing its final payment due date|must include|required \$750|must not include/i.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
