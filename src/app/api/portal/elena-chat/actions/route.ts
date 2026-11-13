import { NextResponse } from 'next/server'
import { issueElenaTaskConfirmation, consumeElenaTaskConfirmation } from '@/lib/luxorElenaTaskConfirmationServer'
import {
  DeveloperSupportConfirmationExpiredError,
  issueElenaDeveloperSupportConfirmation,
  consumeElenaDeveloperSupportConfirmation,
} from '@/lib/luxorElenaDeveloperSupportConfirmationServer'

// Preparation and confirmation are deliberately separate. A confirm request
// supplies only an opaque token; neither the action nor its summary is trusted.
export async function POST(request: Request) {
  const originOk = request.headers.get('origin') === new URL(request.url).origin
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    if (!originOk) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  }
  const value = body as Record<string, unknown>
  if (!originOk) {
    if (value.action === 'CONFIRM_DEVELOPER_SUPPORT' || value.action === 'PREPARE_DEVELOPER_SUPPORT') {
      console.error('[developer-support] request rejected', {
        step: 'origin',
        action: value.action === 'CONFIRM_DEVELOPER_SUPPORT' ? 'confirm' : 'prepare',
      })
    }
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }
  const options = { headers: { 'Cache-Control': 'no-store' } }
  try {
    if (value.action === 'PREPARE_TASK' && Object.keys(value).every(k => ['action', 'task'].includes(k))) {
      const confirmation = await issueElenaTaskConfirmation(value.task)
      return NextResponse.json({ confirmation }, options)
    }
    if (value.action === 'CONFIRM_TASK' && Object.keys(value).every(k => ['action', 'token'].includes(k))) {
      const result = await consumeElenaTaskConfirmation(value.token)
      return NextResponse.json({ success: true, result }, options)
    }
    if (value.action === 'PREPARE_DEVELOPER_SUPPORT' && Object.keys(value).every(k => ['action', 'ticket'].includes(k))) {
      try {
        const confirmation = await issueElenaDeveloperSupportConfirmation(value.ticket)
        return NextResponse.json({ confirmation }, options)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The support ticket could not be prepared.'
        console.error('[developer-support] prepare failed:', detail)
        const safe = detail.length > 0 && detail.length <= 400 && !/token_hash|service_role|authorization/i.test(detail)
          ? detail
          : 'The support ticket could not be prepared.'
        return NextResponse.json({ error: safe }, { ...options, status: 400 })
      }
    }
    if (value.action === 'CONFIRM_DEVELOPER_SUPPORT' && !Object.keys(value).every(k => ['action', 'token'].includes(k))) {
      console.error('[developer-support] confirm failed', { step: 'body' })
    }
    if (value.action === 'CONFIRM_DEVELOPER_SUPPORT' && Object.keys(value).every(k => ['action', 'token'].includes(k))) {
      try {
        const result = await consumeElenaDeveloperSupportConfirmation(value.token)
        return NextResponse.json({ success: true, result }, options)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The support ticket could not be sent.'
        const safe = detail.length > 0 && detail.length <= 400 && !/token_hash|service_role|authorization|bearer /i.test(detail)
          ? detail
          : 'The support ticket could not be sent. Try reviewing the ticket again.'
        if (error instanceof DeveloperSupportConfirmationExpiredError) {
          console.error('[developer-support] confirm failed', { step: 'consume', status: 410, reason: 'confirmation_unavailable' })
          return NextResponse.json({ error: safe, code: error.code }, { ...options, status: 410 })
        }
        console.error('[developer-support] confirm failed', { step: 'consume', status: 400, reason: safe })
        return NextResponse.json({ error: safe, code: 'confirmation_failed' }, { ...options, status: 400 })
      }
    }
    return NextResponse.json({ error: 'This Elena action is unavailable. Use the appropriate portal workflow.' }, { ...options, status: 403 })
  } catch {
    // A failed response after a database commit is ambiguous. The client must
    // check the task list, not blindly issue a new confirmation.
    if (value.action === 'CONFIRM_DEVELOPER_SUPPORT') {
      console.error('[developer-support] confirm failed', { step: 'unhandled', status: 409 })
    }
    return NextResponse.json({ error: 'The action could not be verified. Check the task list before trying again.' }, { ...options, status: 409 })
  }
}
