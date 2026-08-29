import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'
export default function ReportsLayout({ children }: { children: React.ReactNode }) { return <PortalPermissionGate permission="reports">{children}</PortalPermissionGate> }
