import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'
export default function MarketingLayout({ children }: { children: React.ReactNode }) { return <PortalPermissionGate permission="marketing">{children}</PortalPermissionGate> }
