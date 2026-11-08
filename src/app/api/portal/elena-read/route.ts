import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { buildElenaReadPath, type ElenaReadPermission } from '@/lib/luxorElenaStructuredRead'

/** Only the fixed structured query language is accepted; never raw SQL. */
export async function POST(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active') return NextResponse.json({ error: 'Active portal access required.' }, { status: 403 })
  const permissions = new Set<ElenaReadPermission>()
  for (const permission of ['leads', 'planner', 'finances', 'operations', 'calendar'] as const) if (memberCan(member, permission)) permissions.add(permission)
  let query: ReturnType<typeof buildElenaReadPath>
  try { query = buildElenaReadPath(await request.json(), permissions) }
  catch { return NextResponse.json({ error: 'This query or requested field is unavailable.' }, { status: 400 }) }
  try {
    const data = query.mode === 'count' ? await supabaseRestCount(query.path) : await supabaseRestStrict<unknown[]>(query.path)
    if (query.mode === 'list' && !Array.isArray(data)) throw new Error('Incomplete response')
    return NextResponse.json({ mode: query.mode, data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Records could not be verified.' }, { status: 503 })
  }
}
