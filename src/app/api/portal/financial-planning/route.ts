import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { createPlanningStoreDraft } from '@/lib/luxorFinancialPlanningServer'
import { handlePlanningDraft } from '@/lib/luxorFinancialPlanningApi'

/** Requires the separately reviewed financial-planning SQL proposal. */
const deps = createPlanningStoreDraft({
  async authorize() {
    const session = await getLuxorPortalSession()
    if (!session) return null
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return null
    return { email: member.email, principalScope: member.id }
  },
  rest: supabaseRestStrict,
})
export const dynamic = 'force-dynamic'
export async function GET(request: Request) { return handlePlanningDraft(request, deps) }
export async function POST(request: Request) { return handlePlanningDraft(request, deps) }
