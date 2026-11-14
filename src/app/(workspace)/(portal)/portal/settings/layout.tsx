import { PortalPermissionGate } from '@/components/portal/PortalPermissionGate'

export default function SettingsAccessLayout({ children }: { children: React.ReactNode }) { return <PortalPermissionGate permission="settings">{children}</PortalPermissionGate> }
