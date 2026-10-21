'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { Mail, Menu, Plus } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AllEmailsTab } from '../marketing/tabs/AllEmailsTab'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import type { LuxorSharedMailbox } from '@/lib/luxorSharedMailboxes'

export default function EmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsPageContent />
    </Suspense>
  )
}

function EmailsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])
  const [sharedMailboxes, setSharedMailboxes] = useState<LuxorSharedMailbox[]>([])
  const [mailboxDrawerOpen, setMailboxDrawerOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(Boolean(searchParams?.get('messageId')))

  const requestedMailbox = searchParams?.get('mailbox') || 'all'
  const activeMailbox = useMemo(
    () => sharedMailboxes.find((mailbox) => mailbox.key === requestedMailbox) || null,
    [requestedMailbox, sharedMailboxes],
  )

  useEffect(() => {
    let active = true
    fetch('/api/inquiries', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        if (active && Array.isArray(data)) setInquiries(data)
      })
      .catch((error) => console.error('Failed to load inquiries for email context:', error))

    fetch('/api/portal/shared-mailboxes', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { mailboxes: [] })
      .then((data) => {
        if (active && Array.isArray(data.mailboxes)) setSharedMailboxes(data.mailboxes)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  return (
    <PortalPageFrame className="h-full flex-1 min-h-0 overflow-clip !gap-2 sm:!gap-4">
      <div className="hidden lg:block">
        <PortalPageHeader
          icon={<Mail size={18} />}
          title="Emails"
          mobileActionsInline
          hideBackButton={readerOpen}
          titleClassName="whitespace-nowrap text-[1.875rem] sm:text-3xl"
          actions={
            <div className="flex items-center gap-2">
            {!readerOpen ? <PortalButton
              variant="secondary"
              className="min-h-11 min-w-11 justify-center px-3"
              aria-label="Open mailbox navigation"
              onClick={() => setMailboxDrawerOpen(true)}
            >
              <Menu size={16} aria-hidden="true" />
            </PortalButton> : null}
            <PortalButton
              variant="primary"
              className="min-h-11 whitespace-nowrap"
              aria-label="Compose email"
              onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email'))}
            >
              <Plus size={13} aria-hidden="true" />
              <span>Compose<span className="hidden sm:inline"> Email</span></span>
            </PortalButton>
            </div>
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AllEmailsTab
          key={activeMailbox?.key || 'all'}
          inquiries={inquiries}
          initialMessageId={searchParams?.get('messageId') || undefined}
          mailboxEmail={activeMailbox?.address}
          mailboxName={activeMailbox?.label}
          sharedMailboxes={sharedMailboxes}
          activeMailboxKey={activeMailbox?.key || 'all'}
          onReaderOpenChange={setReaderOpen}
          mailboxDrawerOpen={mailboxDrawerOpen}
          onMailboxDrawerOpenChange={setMailboxDrawerOpen}
          onMailboxChange={(mailbox) => router.push(mailbox === 'all' ? '/portal/emails' : `/portal/emails?mailbox=${encodeURIComponent(mailbox)}`)}
        />
      </div>
    </PortalPageFrame>
  )
}
