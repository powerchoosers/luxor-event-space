import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'
export default function FinancesLayout({ children }: { children: React.ReactNode }) { return <PortalPermissionGate permission="finances">{children}</PortalPermissionGate> }
