import { PortalPageFrame } from '@/components/portal/PortalUI'
import { LuxorMessenger } from '@/components/portal/LuxorMessenger'

export default function MessagesPage() {
  return (
    <PortalPageFrame className="h-full min-h-0 flex flex-col overflow-hidden">
      <LuxorMessenger />
    </PortalPageFrame>
  )
}
