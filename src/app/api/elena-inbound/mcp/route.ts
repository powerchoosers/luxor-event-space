import { handleElenaLiveMcp, elenaLiveInboundReady } from '@/lib/luxorElenaInboundServer'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(request: Request) {
  if (!elenaLiveInboundReady()) return Response.json({ error: 'Live inbound is disabled or incomplete.' }, { status: 503 })
  try { return await handleElenaLiveMcp(request) } catch { return Response.json({ error: 'Live call tools are unavailable.' }, { status: 503 }) }
}
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }) }
export function DELETE() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }) }
