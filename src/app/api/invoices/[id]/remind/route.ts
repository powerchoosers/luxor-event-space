import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { listNotesByInquiry, createNote } from '@/lib/luxorNotesServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { createLuxorEmailJob, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildAiTailoredInvoiceReminderEmail } from '@/lib/luxorLifecycleEmailsServer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry?.email) {
      return NextResponse.json({ error: 'Lead email address missing. Add an email to send reminders.' }, { status: 400 })
    }

    const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)

    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({})) as { kind?: 'unpaid_invoice' | 'sixty_day_deadline' | 'final_payment' }
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = bookings.find((b) => b.invoice_id === invoice.id) || bookings[0] || null

    const notes = await listNotesByInquiry(inquiry.id).catch(() => [])

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    const publicToken = invoice.public_token || crypto.randomUUID()
    if (!invoice.public_token) {
      await updateInvoice(invoice.id, { public_token: publicToken })
    }

    const reviewUrl = invoice.stripe_checkout_url || `${origin}/proposal/${publicToken}`
    const now = new Date().toISOString()

    let daysUntil60Days: number | null = null
    const targetEventDate = booking?.event_date || inquiry.target_date
    if (targetEventDate) {
      const eventTime = new Date(`${targetEventDate}T12:00:00-05:00`).getTime()
      const sixtyDaysBefore = eventTime - 60 * 24 * 60 * 60_000
      daysUntil60Days = Math.round((sixtyDaysBefore - Date.now()) / (24 * 60 * 60_000))
    }

    const reminderKind = body.kind || (daysUntil60Days !== null && daysUntil60Days <= 14 ? 'sixty_day_deadline' : 'unpaid_invoice')

    const email = await buildAiTailoredInvoiceReminderEmail({
      inquiry,
      invoice,
      booking,
      reviewUrl,
      balanceDue,
      dueDate: invoice.due_date || booking?.final_payment_due_date,
      notes,
      kind: reminderKind,
    })

    const job = await createLuxorEmailJob({
      inquiryId: inquiry.id,
      bookingId: booking?.id || null,
      jobType: reminderKind === 'sixty_day_deadline' ? 'sixty_day_payment_reminder' : 'unpaid_invoice_reminder',
      recipientEmail: inquiry.email,
      subject: email.subject,
      body: email.body,
      scheduledFor: now,
      metadata: {
        manual: true,
        requestedBy: session.email,
        balance_due: balanceDue,
        ai_generated: email.aiGenerated,
      },
    })

    try {
      await sendLuxorZohoEmail({
        to: inquiry.email,
        subject: email.subject,
        content: email.body,
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
      })

      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: now })
      await createNote(
        inquiry.id,
        `AI-tailored invoice reminder sent to ${inquiry.email} (${money(balanceDue)} balance due).`,
        'email_log',
        session.email,
      )

      return NextResponse.json({
        success: true,
        subject: email.subject,
        aiGenerated: email.aiGenerated,
        balanceDue,
        recipient: inquiry.email,
      })
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : 'Failed to send email.'
      await updateLuxorEmailJob(job.id, { status: 'failed', last_error: errorMsg })
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to send invoice reminder:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invoice reminder.' },
      { status: 500 },
    )
  }
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
