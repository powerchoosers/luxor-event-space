import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { schemaUnavailable } from '@/lib/luxorDocumentCreatorServer'
import { createLuxorCreatedDocumentTestSigningLink } from '@/lib/luxorCreatedDocumentSigningServer'

type RouteContext = { params: Promise<{ id: string }> }

function requestSiteOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')
  if (!host) return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/$/, '')
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as {
    roleKey?: unknown
    signerName?: unknown
    signerEmail?: unknown
  } | null
  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey.trim() : ''
  if (!roleKey) return NextResponse.json({ error: 'Choose a signer role.' }, { status: 400 })
  try {
    const result = await createLuxorCreatedDocumentTestSigningLink({
      documentId: id,
      roleKey,
      siteOrigin: requestSiteOrigin(request),
      signerName: typeof body?.signerName === 'string' ? body.signerName : undefined,
      signerEmail: typeof body?.signerEmail === 'string' ? body.signerEmail : undefined,
    })
    return NextResponse.json({
      preview: true,
      roleLabel: result.signer.role_label,
      signingUrl: result.signingUrl,
      expiresAt: result.expiresAt,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Test signing link failed', error)
    if (schemaUnavailable(error)) {
      return NextResponse.json({ error: 'Signing tables are not stored yet.' }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test signing link could not be created.' }, { status: 503 })
  }
}