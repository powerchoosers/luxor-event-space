'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { FileText, Mail, Plus } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AllEmailsTab } from '../marketing/tabs/AllEmailsTab'
import { PortalAnimatedTabs, PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
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
  const [readerOpen, setReaderOpen] = useState(Boolean(searchParams?.get('messageId')))
  const [sharedMailboxes, setSharedMailboxes] = useState<LuxorSharedMailbox[]>([])

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
    <PortalPageFrame className="h-full flex-1 min-h-0 overflow-clip">
      <div className={readerOpen ? 'hidden xl:block' : ''}>
        <PortalPageHeader
          icon={<Mail size={18} />}
          title="Emails"
          mobileActionsInline
          actions={
            <PortalButton
              variant="primary"
              className="min-h-11 whitespace-nowrap"
              aria-label="Compose email"
              onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email'))}
            >
              <Plus size={13} aria-hidden="true" />
              <span>Compose<span className="hidden sm:inline"> Email</span></span>
            </PortalButton>
          }
        />
      </div>
      {sharedMailboxes.length > 0 && !readerOpen ? (
        <div className="mb-3 shrink-0 overflow-x-auto portal-scrollbar">
          <PortalAnimatedTabs
            tabs={[
              { id: 'all', label: 'All email', icon: <Mail size={14} /> },
              ...sharedMailboxes.map((mailbox) => ({ id: mailbox.key, label: mailbox.label, icon: <FileText size={14} /> })),
            ]}
            activeTab={activeMailbox?.key || 'all'}
            onTabChange={(mailbox) => router.replace(mailbox === 'all' ? '/portal/emails' : `/portal/emails?mailbox=${encodeURIComponent(mailbox)}`)}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AllEmailsTab
          key={activeMailbox?.key || 'all'}
          inquiries={inquiries}
          initialMessageId={searchParams?.get('messageId') || undefined}
          onReaderOpenChange={setReaderOpen}
          mailboxEmail={activeMailbox?.address}
          mailboxName={activeMailbox?.label}
        />
      </div>
    </PortalPageFrame>
  )
}
