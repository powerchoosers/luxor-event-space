import { PortalPageFrame } from '@/components/portal/PortalUI'
import { LuxorMessenger } from '@/components/portal/LuxorMessenger'

export default function MessagesPage() {
  return (
    <PortalPageFrame className="flex h-full min-h-0 flex-1 flex-col overflow-clip !min-h-0 !gap-0">
      <LuxorMessenger />
    </PortalPageFrame>
  )
}
