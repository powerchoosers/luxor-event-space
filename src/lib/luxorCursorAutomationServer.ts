import 'server-only'

export type LuxorCursorAutomationDispatch = {
  success: boolean
  runUuid: string | null
  backgroundComposerId: string | null
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

export async function triggerLuxorCursorAutomation(context: string): Promise<LuxorCursorAutomationDispatch> {
  const url = process.env.LUXOR_CURSOR_AUTOMATION_WEBHOOK_URL?.trim()
  const secret = process.env.LUXOR_CURSOR_AUTOMATION_WEBHOOK_SECRET?.trim()
  if (!url || !secret) throw new Error('Developer support automation is not configured yet.')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context: context.slice(0, 24_000) }),
    cache: 'no-store',
  })

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
    const preview = raw.trim().slice(0, 180)
    throw new Error(preview ? `Cursor automation rejected the ticket (${response.status}): ${preview}` : `Cursor automation rejected the ticket (${response.status}).`)
  }

  const dispatch = parseDispatchBody(parsed)
  if (!dispatch.success) throw new Error('Cursor automation did not accept the ticket.')
  return dispatch
}
