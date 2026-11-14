import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'
export default function OperationsLayout({ children }: { children: React.ReactNode }) { return <PortalPermissionGate permission="operations">{children}</PortalPermissionGate> }
