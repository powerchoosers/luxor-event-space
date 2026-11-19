import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import {
  remindLuxorCreatedDocumentSigners,
  sendLuxorCreatedDocumentForSignature,
  voidLuxorCreatedDocument,
} from '@/lib/luxorCreatedDocumentDeliveryServer'
import { schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'
import type { CreatedDocumentSigningOrder } from '@/lib/luxorCreatedDocumentSendPlan'

type RouteContext = { params: Promise<{ id: string }> }

function signingOrder(value: unknown): CreatedDocumentSigningOrder {
  return value === 'sequential' ? 'sequential' : 'parallel'
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as {
    action?: unknown
    subject?: unknown
    message?: unknown
    signingOrder?: unknown
    reminderEnabled?: unknown
    reminderAfterDays?: unknown
    signers?: unknown
  } | null
  try {
    const action = body?.action === 'remind' || body?.action === 'void' ? body.action : 'send'
    if (action === 'void') {
      const document = await voidLuxorCreatedDocument(id)
      return NextResponse.json({ document })
    }
    if (action === 'remind') {
      const document = await remindLuxorCreatedDocumentSigners({ documentId: id, confirmLiveSend: true })
      return NextResponse.json({ document })
    }
    const signers = Array.isArray(body?.signers)
      ? body.signers.flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const item = row as Record<string, unknown>
          if (typeof item.id !== 'string') return []
          return [{
            id: item.id,
            name: typeof item.name === 'string' ? item.name : '',
            email: typeof item.email === 'string' ? item.email : '',
            role_label: typeof item.role_label === 'string' ? item.role_label : 'Signer',
          }]
        })
      : []
    const document = await sendLuxorCreatedDocumentForSignature({
      documentId: id,
      signers,
      subject: typeof body?.subject === 'string' ? body.subject : '',
      message: typeof body?.message === 'string' ? body.message : '',
      signingOrder: signingOrder(body?.signingOrder),
      reminderEnabled: body?.reminderEnabled === true,
      reminderAfterDays: Number(body?.reminderAfterDays ?? 3),
      confirmLiveSend: true,
    })
    return NextResponse.json({ document })
  } catch (error) {
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Document sending is not stored yet.' }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'The document could not be sent.'
    const status = /not found/i.test(message) ? 404 : /already been sent|before sending|valid email|template|remind|voided|recipient/i.test(message) ? 400 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
