'use client'

import { Suspense } from 'react'
import { ToastProvider } from '@/components/portal/ToastProvider'
import { OperationsPageContent } from '@/components/portal/OperationsWorkspace'

export default function PreferredVendorsBrowserFixture() {
  return (
    <ToastProvider>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <Suspense fallback={<p className="text-sm text-[color:var(--portal-muted)]">Loading operations…</p>}>
          <OperationsPageContent />
        </Suspense>
      </main>
    </ToastProvider>
  )
}
