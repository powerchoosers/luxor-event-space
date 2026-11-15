'use client'

import React from 'react'
import Link from 'next/link'
import { Check, LoaderCircle, TrendingUp } from '@/lib/icons/phosphor-compat'
import { PortalButton } from '@/components/portal/PortalUI'
import {
  funnelGoalDisplayCells,
  FUNNEL_GOAL_LABELS,
  type ElenaFunnelGoalsCardPayload,
} from '@/lib/luxorFunnelGoalsElena'
import { saveFunnelGoals } from '@/components/portal/LeadsFunnelDashboard'

type ElenaFunnelGoalsCardProps = {
  payload: ElenaFunnelGoalsCardPayload
  onSaved?: (saved: { revision: number; updatedAt: string | null }) => void
}

function formatValue(metric: keyof typeof FUNNEL_GOAL_LABELS, value: number) {
  if (metric === 'revenue') {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  }
  return value.toLocaleString('en-US')
}

export function ElenaFunnelGoalsCard({ payload, onSaved }: ElenaFunnelGoalsCardProps) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(Boolean(payload.savedAt))
  const cells = React.useMemo(
    () => funnelGoalDisplayCells(payload.goals, payload.changedPaths),
    [payload.goals, payload.changedPaths],
  )

  async function confirmSave() {
    if (saving || saved || !payload.canSave) return
    setSaving(true)
    setError(null)
    try {
      const result = await saveFunnelGoals(payload.goals, payload.revision)
      setSaved(true)
      onSaved?.({ revision: result.revision, updatedAt: result.updatedAt })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Goals could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="mt-2 w-full min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[color:var(--portal-text)] sm:p-4"
      aria-label="Funnel goals review"
    >
      <div className="flex min-w-0 items-start gap-3">
        <TrendingUp size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#e3bc65]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Funnel goals</p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-text)]">{payload.summary}</p>
          {payload.calculations ? (
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--portal-muted)]">{payload.calculations}</p>
          ) : null}
          {payload.assumptions?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-[color:var(--portal-muted)]">
              {payload.assumptions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {payload.conflicts?.length ? (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-950 dark:text-amber-100">
              <p className="font-semibold">Review period alignment</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {payload.conflicts.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">
            Defaults: daily goals calculate calendar totals. Explicit weekly, monthly, quarterly, or annual values override those totals.
            Unlisted saved targets stay unchanged.
          </p>
        </div>
      </div>

      <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-[color:var(--portal-border)] pr-1 sm:pr-0">
        <table className="w-full min-w-0 text-left text-[11px] sm:min-w-[280px]">
          <thead className="bg-[color:var(--portal-soft)]/50 text-[color:var(--portal-muted)]">
            <tr>
              <th className="px-2 py-2 font-semibold">Target</th>
              <th className="px-2 py-2 font-semibold">Value</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={`${cell.metric}-${cell.cadence}`} className="border-t border-[color:var(--portal-border)]">
                <td className="px-2 py-2">
                  <span className={cell.changed ? 'font-semibold text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}>
                    {cell.label}
                  </span>
                  {cell.changed ? (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a712e] dark:text-[#f1d27a]">Updated</span>
                  ) : null}
                </td>
                <td className="px-2 py-2 font-medium tabular-nums">{formatValue(cell.metric, cell.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p> : null}

      {saved ? (
        <ButtonSuccess canSave={payload.canSave} />
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
          <Link
            href="/portal/settings?tab=funnelGoals"
            className="text-[11px] font-semibold text-[#9a712e] underline-offset-2 hover:underline dark:text-[#f1d27a]"
          >
            Open Settings goals
          </Link>
          <PortalButton
            type="button"
            variant="primary"
            disabled={saving || !payload.canSave}
            onClick={() => void confirmSave()}
            className="min-h-10"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                Saving…
              </span>
            ) : 'Save goals'}
          </PortalButton>
        </div>
      )}
    </section>
  )
}

function ButtonSuccess({ canSave }: { canSave: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--portal-border)] pt-3 text-xs font-semibold text-[color:var(--portal-text)]">
      <Check size={15} aria-hidden="true" className="text-[#9a712e] dark:text-[#f1d27a]" />
      {canSave ? 'Goals saved. Settings and the Leads funnel dashboard will show these values.' : 'Goals saved.'}
    </div>
  )
}