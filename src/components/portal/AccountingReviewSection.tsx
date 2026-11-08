'use client'

import { useCallback, useState } from 'react'
import { AccountingSetup } from '@/components/portal/AccountingSetup'
import { StatementImportReview } from '@/components/portal/StatementImportReview'
import type { AccountingSetupRecord } from '@/lib/luxorAccountingSetup'

/** Integrators choose placement; API authorization remains the source of access control. */
export function AccountingReviewSection({ canEdit = false }: { canEdit?: boolean }) {
  const [records, setRecords] = useState<AccountingSetupRecord[] | null>(null)
  const onRecordsChange = useCallback((next: AccountingSetupRecord[] | null) => setRecords(next), [])
  return <div className="space-y-4">
    <AccountingSetup canEdit={canEdit} onRecordsChange={onRecordsChange} />
    {records === null && <p className="text-sm text-[color:var(--portal-muted)]">Statement account choices are unavailable until accounting setup loads.</p>}
    <StatementImportReview accounts={records || []} canEdit={canEdit && records !== null} />
  </div>
}
