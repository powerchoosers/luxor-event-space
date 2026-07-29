'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { Mail, Plus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { AllEmailsTab } from '../marketing/tabs/AllEmailsTab'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

export default function EmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsPageContent />
    </Suspense>
  )
}

function EmailsPageContent() {
  const searchParams = useSearchParams()
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])

  useEffect(() => {
    let active = true
    fetch('/api/inquiries', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        if (active && Array.isArray(data)) setInquiries(data)
      })
      .catch((error) => console.error('Failed to load inquiries for email context:', error))

    return () => {
      active = false
    }
  }, [])

  return (
    <PortalPageFrame className="h-full flex-1 min-h-0 overflow-clip">
      <PortalPageHeader
        icon={<Mail size={18} />}
        title="Emails"
        actions={
          <PortalButton
            variant="primary"
            onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email'))}
          >
            <Plus size={13} /> Compose Email
          </PortalButton>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AllEmailsTab
          inquiries={inquiries}
          initialMessageId={searchParams?.get('messageId') || undefined}
        />
      </div>
    </PortalPageFrame>
  )
}
