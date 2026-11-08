'use client'

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPlanningClientDraft } from '@/lib/luxorFinancialPlanningClient'
import { createPlanningRetryStoreDraft } from '@/lib/luxorFinancialPlanningRecovery'
import { inspectFinancialPlanningLogout } from '@/lib/luxorFinancialPlanningLogout'
import { LuxorPlanningControlsDraft, type GoalActualDraft } from './FinancialPlanningControls'
import { FinancialPlanningBudgetContext } from './FinancialPlanningBudgetContext'
import { FinancialRevenuePlan } from './FinancialRevenuePlan'
import { planningActualsFromBudgetMonth } from '@/lib/luxorFinancialPlanningActuals'
import type { PlanningBudgetSnapshot } from '@/lib/luxorFinancialPlanningBudgetBridge'
import type { PlanningReviewItem, StoredPlanningItem } from '@/lib/luxorFinancialPlanningApi'

export type FinancialPlanningLogoutState = ReturnType<typeof inspectFinancialPlanningLogout>
type Loaded = { scope: string; items: StoredPlanningItem[]; needsReview: PlanningReviewItem[]; recovery: ReturnType<typeof createPlanningRetryStoreDraft> }
/**
 * ISOLATED host adapter for an existing finance panel, not a page or route.
 * Finance owns the existing budget fetch and supplies its verified snapshot.
 * The stable logout-inspector callback must retain the last inspector across
 * panel unmounts; null/unavailable means unknown, not clear. Remount/refetch
 * the snapshot after identity changes and never silently clear a pending save.
 */
export function LuxorPlanningPanelDraft({ endpoint, today, budget, actuals = {}, sourceRevision = 0, identityRevision, onOpenBudget, onBudgetSaved, onLogoutInspector }: {
  endpoint: string
  today: string
  budget: PlanningBudgetSnapshot | null
  /** Increment whenever the verified signed-in identity changes. */
  identityRevision: number
  /** Use a monotonically increasing value when Finance data changes. */
  sourceRevision?: number
  /** Only source-verified actuals for the matching metric and period; never infer missing values. */
  actuals?: Record<string, GoalActualDraft | undefined>
  onOpenBudget?: () => void
  /** Must invalidate and refetch the Finance budget snapshot after a write. */
  onBudgetSaved: () => void
  onLogoutInspector: (inspect: (() => FinancialPlanningLogoutState) | null) => void
}) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: Loaded | null; error: string | null } | null>(null)
  const key = JSON.stringify([endpoint, identityRevision, revision])
  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      try {
        const data = await createPlanningClientDraft(endpoint).list()
        // Storage can be unavailable; fail closed rather than send untracked writes.
        const recovery = createPlanningRetryStoreDraft(window.sessionStorage, data.principalScope)
        recovery.load()
        if (active) setResult({ key, data: { scope: data.principalScope, items: data.items, needsReview: data.needsReview, recovery }, error: null })
      } catch {
        if (active) setResult({ key, data: null, error: 'Planning records or local retry storage are unavailable.' })
      }
    })
    return () => { active = false }
  }, [endpoint, key])
  const loaded = result?.key === key ? result.data : null
  const error = result?.key === key ? result.error : null
  // Replace the prior scope before the committed identity change can be used.
  // The shell still owns a long-lived inspector outside this mounted panel.
  useLayoutEffect(() => {
    onLogoutInspector(loaded ? () => inspectFinancialPlanningLogout(window.sessionStorage, loaded.scope) : () => ({ status: 'unavailable' }))
  }, [loaded, onLogoutInspector])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  if (error) return <p role="alert" className="text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="underline" onClick={refresh}>Try again</button></p>
  if (!loaded) return <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading planning…</p>
  const usableBudget = budget?.report?.today === today ? budget : null
  const monthlyActuals = usableBudget ? planningActualsFromBudgetMonth(loaded.items, usableBudget.report) : {}
  const selectedYear = Number((usableBudget?.report.month || today).slice(0, 4))
  return <div className="space-y-4"><FinancialPlanningBudgetContext snapshot={usableBudget} today={today} items={loaded.items} principalScope={loaded.scope} sourceRevision={sourceRevision} onOpenBudget={onOpenBudget} /><FinancialRevenuePlan year={selectedYear} scope={loaded.scope} onSaved={onBudgetSaved} /><LuxorPlanningControlsDraft needsReview={loaded.needsReview} key={loaded.scope} scope={loaded.scope} today={today} items={loaded.items} actuals={{ ...actuals, ...monthlyActuals }} recovery={loaded.recovery} onSaved={refresh} save={(request) => createPlanningClientDraft(endpoint).save(loaded.scope, request)} /></div>
}
