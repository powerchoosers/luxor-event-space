import { redirect } from 'next/navigation'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { PlannerWorkspaceClient } from '@/components/portal/PlannerWorkspaceClient'

export async function PlannerRoute({ section = 'overview', bookingId }: { section?: 'overview'|'events'|'tasks'|'meetings'|'design-library'|'vendors'|'files'; bookingId?: string }) {
  const session = await getLuxorPortalSession()
  if (!session) redirect('/portal/login')
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'planner')) redirect('/portal?error=planner-access')
  const profile = await getLuxorUserProfile(session.email)
  return <PlannerWorkspaceClient initialSection={section} bookingId={bookingId} greetingName={profile.displayName}/>
}
