'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PortalButton } from '@/components/portal/PortalUI'
import {
  FUNNEL_GOAL_CADENCES,
  FUNNEL_GOAL_METRICS,
  type FunnelGoals,
  type FunnelGoalMetric,
} from '@/lib/luxorFunnelGoals'
import {
  parseGoalSnapshot,
  readPendingFunnelGoals,
  saveFunnelGoals,
  type GoalSnapshot,
} from '@/components/portal/LeadsFunnelDashboard'

const LABELS: Record<FunnelGoalMetric, string> = {
  newInquiries: 'New inquiries',
  toursScheduled: 'Tours scheduled',
  toursCompleted: 'Tours completed',
  proposalsSent: 'Proposals sent',
  bookedEvents: 'Booked events',
  revenue: 'Revenue',
}

const field =
  'w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2 py-2 text-sm text-[color:var(--portal-text)] focus:outline-none focus:ring-2 focus:ring-[#caa24c]/60'

const card = 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5'

export function FunnelGoalsSettingsPanel() {
  const [snapshot, setSnapshot] = useState<GoalSnapshot | null>(null)
  const [draft, setDraft] = useState<FunnelGoals | null>(null)
  const [loadError, setLoadError] = useState('')
  const [statusNotice, setStatusNotice] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [reload, setReload] = useState(0)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [quarter, setQuarter] = useState(() => {
    const now = new Date()
    return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
  })
  const savingRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setLoadError('')
    fetch('/api/portal/funnel-goals', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const parsed = parseGoalSnapshot(await response.json())
        if (!response.ok || !parsed) throw new Error('Saved goals are unavailable.')
        if (!active) return
        setSnapshot(parsed)
        try {
          const prior = readPendingFunnelGoals()
          setDraft(prior?.goals || structuredClone(parsed.goals))
          setPending(Boolean(prior))
          setSaveNotice(prior ? 'An earlier save is unconfirmed. Retry it unchanged to check the result.' : '')
        } catch (error) {
          setDraft(structuredClone(parsed.goals))
          setPending(false)
          setSaveNotice(error instanceof Error ? error.message : 'Previous save needs review.')
        }
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setLoadError('Saved goals could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [reload])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || !snapshot || savingRef.current || !snapshot.canEdit) return
    savingRef.current = true
    setSaving(true)
    setSaveNotice('')
    try {
      const saved = await saveFunnelGoals(draft, snapshot.revision)
      if (mounted.current) {
        setSnapshot(saved)
        setDraft(structuredClone(saved.goals))
        setPending(false)
        setStatusNotice('Goals saved. The Leads funnel dashboard will use them on the next load.')
        setReload((n) => n + 1)
      }
    } catch (error) {
      if (mounted.current) {
        setSaveNotice(error instanceof Error ? error.message : 'Save could not be confirmed.')
        try {
          setPending(Boolean(readPendingFunnelGoals()))
        } catch {
          setPending(true)
        }
      }
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  function change(metric: FunnelGoalMetric, cadence: (typeof FUNNEL_GOAL_CADENCES)[number], raw: string) {
    if (!draft) return
    setDraft({
      ...draft,
      [metric]: { ...draft[metric], [cadence]: raw === '' ? null : Number(raw) },
    })
  }

  function changeOverride(
    metric: FunnelGoalMetric,
    type: 'monthlyOverrides' | 'quarterlyOverrides',
    key: string,
    raw: string,
  ) {
    if (!draft) return
    const overrides = { ...draft[metric][type] }
    if (raw === '') delete overrides[key]
    else overrides[key] = Number(raw)
    setDraft({ ...draft, [metric]: { ...draft[metric], [type]: overrides } })
  }

  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const quarterValid = /^\d{4}-Q[1-4]$/.test(quarter)

  if (loading) {
    return <div className={`${card} text-sm text-[color:var(--portal-muted)]`}>Loading funnel goals…</div>
  }

  if (loadError) {
    return (
      <section className={`${card} space-y-3`}>
        <p className="text-sm text-[color:var(--portal-muted)]">{loadError}</p>
        <PortalButton onClick={() => setReload((n) => n + 1)}>Retry</PortalButton>
      </section>
    )
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <section className={`${card} space-y-2`}>
        <p className="text-sm text-[color:var(--portal-text)]">
          Set shared targets for the Leads funnel dashboard. Leave a value blank to use its calendar-based total.
        </p>
        <p className="text-xs text-[color:var(--portal-muted)]">
          Goals apply to every device. View progress on{' '}
          <Link href="/portal/leads" className="font-semibold text-[#9a712e] underline-offset-2 hover:underline dark:text-[#f1d27a]">
            Leads → Funnel Dashboard
          </Link>
          .
        </p>
        {snapshot?.updatedAt ? (
          <p className="text-[11px] text-[color:var(--portal-muted)]">
            Last saved {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.updatedAt))}.
          </p>
        ) : null}
      </section>

      {!snapshot?.canEdit ? (
        <section className={`${card} text-sm text-[color:var(--portal-muted)]`}>
          Settings permission is required to edit funnel goals. You can still view targets on the funnel dashboard.
        </section>
      ) : (
        <fieldset disabled={saving || pending} className="space-y-5">
          <legend className="sr-only">Funnel performance goals</legend>

          <div className="hidden overflow-x-auto md:block">
            <section className={card}>
              <table className="w-full min-w-[640px] text-left text-xs">
                <caption className="mb-3 text-left text-[color:var(--portal-muted)]">
                  Defaults: daily goals calculate calendar totals. Explicit weekly, monthly, quarterly, or annual values override those totals.
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">Metric</th>
                    {FUNNEL_GOAL_CADENCES.map((c) => (
                      <th key={c} className="p-2 capitalize">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft
                    ? FUNNEL_GOAL_METRICS.map((metric) => (
                        <tr key={metric}>
                          <th className="p-2 font-semibold">{LABELS[metric]}</th>
                          {FUNNEL_GOAL_CADENCES.map((c) => (
                            <td key={c} className="p-2">
                              <input
                                className={field}
                                type="number"
                                min="0"
                                max="1000000000000"
                                step={metric === 'revenue' ? '0.01' : '1'}
                                aria-label={`${LABELS[metric]} ${c} goal`}
                                value={draft[metric][c] ?? ''}
                                placeholder="Unset"
                                onChange={(e) => change(metric, c, e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </section>
          </div>

          <div className="space-y-3 md:hidden">
            {draft
              ? FUNNEL_GOAL_METRICS.map((metric) => (
                  <section key={metric} className={`${card} space-y-3`}>
                    <h4 className="text-sm font-bold text-[color:var(--portal-text)]">{LABELS[metric]}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {FUNNEL_GOAL_CADENCES.map((c) => (
                        <label key={c} className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                          {c}
                          <input
                            className={`${field} mt-1.5`}
                            type="number"
                            min="0"
                            max="1000000000000"
                            step={metric === 'revenue' ? '0.01' : '1'}
                            aria-label={`${LABELS[metric]} ${c} goal`}
                            value={draft[metric][c] ?? ''}
                            placeholder="Unset"
                            onChange={(e) => change(metric, c, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                ))
              : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(['monthlyOverrides', 'quarterlyOverrides'] as const).map((type) => {
              const monthly = type === 'monthlyOverrides'
              const key = monthly ? month : quarter
              const valid = monthly ? monthValid : quarterValid
              return (
                <section key={type} className={`${card} space-y-3`}>
                  <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
                    {monthly ? 'Month override (YYYY-MM)' : 'Quarter override (YYYY-Q1 to Q4)'}
                    <input
                      type="text"
                      className={`${field} mt-2`}
                      value={key}
                      onChange={(e) => (monthly ? setMonth(e.target.value) : setQuarter(e.target.value))}
                      aria-invalid={!valid}
                    />
                  </label>
                  {!valid ? (
                    <p className="text-xs text-red-600">Enter a valid calendar {monthly ? 'month' : 'quarter'}.</p>
                  ) : null}
                  {draft
                    ? FUNNEL_GOAL_METRICS.map((metric) => (
                        <label key={metric} className="grid grid-cols-1 items-center gap-2 text-xs sm:grid-cols-2">
                          <span className="font-medium text-[color:var(--portal-text)]">{LABELS[metric]}</span>
                          <input
                            className={field}
                            type="number"
                            min="0"
                            max="1000000000000"
                            step={metric === 'revenue' ? '0.01' : '1'}
                            aria-label={`${LABELS[metric]} ${monthly ? 'month' : 'quarter'} override`}
                            disabled={!valid}
                            value={valid ? draft[metric][type][key] ?? '' : ''}
                            placeholder="Use default"
                            onChange={(e) => changeOverride(metric, type, key, e.target.value)}
                          />
                        </label>
                      ))
                    : null}
                </section>
              )
            })}
          </div>

          <p className="text-xs text-[color:var(--portal-muted)]">
            An exact month or quarter override wins over its default. Without a quarterly total, the three month goals are added. The daily chart uses the daily inquiry goal. Revenue is optional.
          </p>
        </fieldset>
      )}

      {statusNotice ? <p className="text-sm text-[color:var(--portal-text)]">{statusNotice}</p> : null}
      {saveNotice ? (
        <p role="alert" className="text-sm text-[color:var(--portal-muted)]">
          {saveNotice}
        </p>
      ) : null}

      {snapshot?.canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          {!pending ? (
            <PortalButton type="button" disabled={saving} onClick={() => setReload((n) => n + 1)}>
              Reload saved goals
            </PortalButton>
          ) : null}
          <PortalButton type="submit" variant="primary" disabled={saving || !draft || pending}>
            {saving ? 'Saving…' : pending ? 'Retry original save' : 'Save goals'}
          </PortalButton>
        </div>
      ) : null}
    </form>
  )
}
