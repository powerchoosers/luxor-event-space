'use client'

import { Suspense } from 'react'
import { OperationsPageContent } from '@/components/portal/OperationsWorkspace'

export default function PreferredVendorsBrowserFixture() {
  return (
    <div
      data-portal-theme="light"
      className="min-h-screen bg-[color:var(--portal-bg)] p-4 text-[color:var(--portal-text)] [--portal-bg:var(--background)]"
    >
      <Suspense fallback={<p className="p-6 text-sm text-[color:var(--portal-muted)]">Loading operations…</p>}>
        <OperationsPageContent />
      </Suspense>
    </div>
  )
}
