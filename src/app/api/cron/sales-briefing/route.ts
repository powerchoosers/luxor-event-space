import { NextRequest, NextResponse } from 'next/server'
import { safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'
import {
  buildLuxorSalesBriefingDelivery,
  recordLuxorSalesBriefingError,
  recordLuxorSalesBriefingSend,
} from '@/lib/luxorSalesBriefingServer'
import { luxorElenaMailDisplayName, luxorElenaMailFrom, luxorElenaMailReplyTo } from '@/lib/luxorMailConfig'
import { sendLuxorResendEmail } from '@/lib/luxorResendMailServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const expectedSecret = process.env.LUXOR_EMAIL_CRON_SECRET || ''

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get('health') === '1') {
    await safelyRecordLuxorWorkerHealth('sales_briefing', {
      status: 'healthy',
      metadata: { check: 'authentication' },
    })
    return NextResponse.json({ ok: true, health: 'healthy' })
  }

  const preview = request.nextUrl.searchParams.get('preview') === '1'

  try {
    const delivery = await buildLuxorSalesBriefingDelivery()
    const { rendered, gate, clock, row } = delivery

    if (preview) {
      await safelyRecordLuxorWorkerHealth('sales_briefing', {
        status: 'healthy',
        metadata: { mode: 'preview', briefingDate: clock.dateKey },
      })
      return NextResponse.json({
        ok: true,
        preview: true,
        subject: rendered.subject,
        html: rendered.html,
        briefingDate: clock.dateKey,
      })
    }

    if (!gate.shouldSend) {
      await safelyRecordLuxorWorkerHealth('sales_briefing', {
        status: 'idle',
        metadata: { reason: gate.reason, briefingDate: clock.dateKey },
      })
      return NextResponse.json({
        ok: true,
        dryRun: true,
        reason: gate.reason,
        subject: rendered.subject,
        htmlLength: rendered.html.length,
        briefingDate: clock.dateKey,
      })
    }

    const recipient = delivery.recipient
    try {
      const result = await sendLuxorResendEmail({
        to: recipient,
        from: luxorElenaMailFrom(),
        fromName: luxorElenaMailDisplayName(),
        replyTo: luxorElenaMailReplyTo(),
        subject: rendered.subject,
        content: rendered.html,
        text: rendered.text,
        idempotencyKey: `sales-briefing/${clock.dateKey}`,
        metadata: { automation_key: 'sales_briefing', briefing_date: clock.dateKey },
      })
      await recordLuxorSalesBriefingSend({
        briefingDateKey: clock.dateKey,
        resendMessageId: result.providerMessageId || result.messageId,
        existingRow: row,
      })
      await safelyRecordLuxorWorkerHealth('sales_briefing', {
        status: 'healthy',
        processed: 1,
        metadata: { briefingDate: clock.dateKey, subject: rendered.subject },
      })
      return NextResponse.json({
        ok: true,
        sent: true,
        subject: rendered.subject,
        briefingDate: clock.dateKey,
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Sales briefing delivery failed.'
      await recordLuxorSalesBriefingError({
        briefingDateKey: clock.dateKey,
        error: message,
        existingRow: row,
      })
      await safelyRecordLuxorWorkerHealth('sales_briefing', {
        status: 'error',
        error: message,
        metadata: { briefingDate: clock.dateKey },
      })
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sales briefing worker failed.'
    await safelyRecordLuxorWorkerHealth('sales_briefing', {
      status: 'error',
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}