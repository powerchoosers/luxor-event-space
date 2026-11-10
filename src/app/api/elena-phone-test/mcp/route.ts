import { handleElenaPhoneMcp, elenaPhoneTestReady } from '@/lib/luxorElenaPhoneTestServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  if (!elenaPhoneTestReady()) return Response.json({ error: 'Phone test is disabled or incomplete.' }, { status: 503 })
  try { return await handleElenaPhoneMcp(request) } catch {
    return Response.json({ error: 'Phone test tools are unavailable.' }, { status: 503 })
  }
}

// This stateless HTTP MCP server has no event stream or persistent transport.
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }) }
export function DELETE() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }) }
