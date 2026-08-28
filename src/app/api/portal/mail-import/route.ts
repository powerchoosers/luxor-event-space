import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { releaseLuxorMailHistory } from '@/lib/luxorMailReleaseServer'
import { archiveLuxorMailSourceChanges, controlLuxorMailImport, getLuxorMailImportStatus, startLuxorMailImport, startLuxorMailSourceComparison, startLuxorMailSourceContent, stepLuxorMailImport } from '@/lib/luxorMailImportServer'

export const runtime = 'nodejs'
export const maxDuration = 120
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  try { return NextResponse.json(await getLuxorMailImportStatus(), { headers }) }
  catch { return NextResponse.json({ error: 'History migration status is unavailable. Check the server configuration.' }, { status: 503, headers }) }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers })
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON request required.' }, { status: 415, headers })
  }
  const text = await request.text()
  if (Buffer.byteLength(text) > 1024) return NextResponse.json({ error: 'Request too large.' }, { status: 413, headers })
  let body: { action?: unknown; confirm?: unknown; passId?: unknown; retainMissing?: unknown }
  try {
    body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid action')
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers }) }
  if (!['start', 'step', 'pause', 'resume', 'retry_failed', 'compare_source', 'check_source_content', 'archive_changes', 'release_history'].includes(String(body.action))) {
    return NextResponse.json({ error: 'Unknown migration action.' }, { status: 400, headers })
  }
  if (body.action === 'start' && body.confirm !== 'archive-zoho-history') {
    return NextResponse.json({ error: 'Confirm archiving Zoho history before starting.' }, { status: 400, headers })
  }
  if (body.action === 'release_history' && (body.confirm !== 'release-verified-history'
    || typeof body.passId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.passId)
    || typeof body.retainMissing !== 'boolean')) {
    return NextResponse.json({ error: 'Review and confirm the saved history snapshot before releasing it.' }, { status: 400, headers })
  }
  try {
    if (body.action === 'release_history') {
      await releaseLuxorMailHistory({ passId: body.passId as string, retainMissing: body.retainMissing as boolean }, session.email)
      return NextResponse.json(await getLuxorMailImportStatus(), { headers })
    }
    if (body.action === 'start') return NextResponse.json(await startLuxorMailImport(session.email), { headers })
    if (body.action === 'compare_source') return NextResponse.json(await startLuxorMailSourceComparison(), { headers })
    if (body.action === 'check_source_content') return NextResponse.json(await startLuxorMailSourceContent(), { headers })
    if (body.action === 'archive_changes') return NextResponse.json(await archiveLuxorMailSourceChanges(), { headers })
    if (body.action === 'step') return NextResponse.json(await stepLuxorMailImport(), { headers })
    return NextResponse.json(await controlLuxorMailImport(body.action as 'pause' | 'resume' | 'retry_failed'), { headers })
  } catch {
    return NextResponse.json({ error: 'The migration action could not finish. Check its saved status; no mail was sent or removed.' }, { status: 409, headers })
  }
}
