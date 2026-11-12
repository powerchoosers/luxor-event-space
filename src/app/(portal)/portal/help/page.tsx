import { PortalHelpAboutPage } from '@/components/portal/PortalHelpAboutPage'

export default function PortalHelpPage() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  return <PortalHelpAboutPage buildId={buildId} />
}
