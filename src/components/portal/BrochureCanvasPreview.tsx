'use client'

import React from 'react'
import { PortalSkeleton } from '@/components/portal/PortalUI'
import type { BrochureCanvasTemplate } from '@/components/portal/BrochureCanvasStep'

type Preview = { subject: string; bodyHtml: string; note: string }
export function BrochureCanvasPreview({ step, delivery }: { step: BrochureCanvasTemplate; delivery: Preview }) {
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    if (step.channel !== 'email' || step.uses_existing_delivery) return
    const controller = new AbortController()
    setPreview(null); setError('')
    const updates = { name: step.name, subject: step.subject || '', body: step.body || '', cta_text: step.cta_text || '', cta_url: step.cta_url || '', secondary_cta_text: step.secondary_cta_text || '', secondary_cta_url: step.secondary_cta_url || '' }
    fetch('/api/marketing/automation-detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ templateId: step.id, updates }) })
      .then(async (response) => { const payload = await response.json() as Preview & { error?: string }; if (!response.ok || !payload.bodyHtml) throw new Error(payload.error || 'Email preview could not load.'); setPreview(payload) })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Email preview could not load.') })
    return () => controller.abort()
  }, [step])
  if (step.channel === 'phone') return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]"><h3 className="text-sm font-bold">{step.name}</h3><p>{step.body || 'No task notes.'}</p><p className="text-[color:var(--portal-muted)]">{step.delay_days} days after the original brochure request</p></div>
  const result = step.uses_existing_delivery ? delivery : preview
  if (error) return <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
  if (!result) return <div className="space-y-3 pt-1"><PortalSkeleton className="h-4 w-48 rounded" /><PortalSkeleton className="h-3 w-72 rounded opacity-60" /><PortalSkeleton className="h-[min(38rem,60vh)] w-full rounded-xl" /></div>
  return <div className="space-y-3"><p className="text-sm font-bold text-[color:var(--portal-text)]">{result.subject}</p><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{result.note}</p><iframe title="Brochure email preview" sandbox="" srcDoc={result.bodyHtml} className="h-[min(42rem,70vh)] w-full rounded-xl border border-[color:var(--portal-border)] bg-white" /></div>
}
