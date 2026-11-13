import 'server-only'

export type LuxorCursorAutomationDispatch = {
  success: boolean
  runUuid: string | null
  backgroundComposerId: string | null
}

export type LuxorDeveloperSupportWebhookPayload = {
  context: string
  pagePath: string
  pageArea: 'portal' | 'public'
  title: string
  priority: string
  ticketId: string
}

function parseDispatchBody(value: unknown): LuxorCursorAutomationDispatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, runUuid: null, backgroundComposerId: null }
  }
  const body = value as Record<string, unknown>
  return {
    success: body.success === true,
    runUuid: typeof body.runUuid === 'string' && body.runUuid.trim() ? body.runUuid.trim() : null,
    backgroundComposerId: typeof body.backgroundComposerId === 'string' && body.backgroundComposerId.trim()
      ? body.backgroundComposerId.trim()
      : null,
  }
}

export async function triggerLuxorCursorAutomation(
  payload: LuxorDeveloperSupportWebhookPayload,
): Promise<LuxorCursorAutomationDispatch> {
  const url = process.env.LUXOR_CURSOR_AUTOMATION_WEBHOOK_URL?.trim()
  const secret = process.env.LUXOR_CURSOR_AUTOMATION_WEBHOOK_SECRET?.trim()
  if (!url || !secret) {
    console.error('[developer-support] cursor webhook failed', { status: null, reason: 'not_configured' })
    throw new Error('Developer support automation is not configured yet.')
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: payload.context.slice(0, 24_000),
        pagePath: payload.pagePath,
        pageRoute: payload.pagePath,
        pageArea: payload.pageArea,
        title: payload.title.slice(0, 200),
        priority: payload.priority,
        ticketId: payload.ticketId,
      }),
      cache: 'no-store',
    })
  } catch {
    console.error('[developer-support] cursor webhook failed', { status: null, reason: 'network' })
    throw new Error('Cursor automation could not be reached.')
  }

  const raw = await response.text().catch(() => '')
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    console.error('[developer-support] cursor webhook failed', { status: response.status })
    throw new Error(`Cursor automation rejected the ticket (${response.status}).`)
  }

  const dispatch = parseDispatchBody(parsed)
  if (!dispatch.success) {
    console.error('[developer-support] cursor webhook failed', { status: response.status, reason: 'not_accepted' })
    throw new Error('Cursor automation did not accept the ticket.')
  }
  return dispatch
}
