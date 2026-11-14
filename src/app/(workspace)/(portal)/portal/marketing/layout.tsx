import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'

// Tab routing uses `?tab=`; force dynamic rendering so SSR matches the request URL and avoids header hydration mismatches.
export const dynamic = 'force-dynamic'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PortalPermissionGate permission="marketing">{children}</PortalPermissionGate>
}
