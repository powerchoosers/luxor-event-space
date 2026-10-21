'use client'

import React from 'react'
import { ArrowUpRight, LayoutTemplate, Plus } from 'lucide-react'
import { PortalButton } from '@/components/portal/PortalUI'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { EMAIL_TEMPLATES, type EmailTemplate } from '../emailTemplates'

type SavedTemplate = {
  id: string
  name: string
  subject: string | null
  description: string | null
  category: string | null
  blocks: unknown
  preview_color: string | null
  metadata: Record<string, unknown> | null
}

type MarketingTemplatesTabProps = {
  onOpenTemplate: (template: EmailTemplate) => void
  onOpenBuilder: () => void
}

export function MarketingTemplatesTab({ onOpenTemplate, onOpenBuilder }: MarketingTemplatesTabProps) {
  const [savedTemplates, setSavedTemplates] = React.useState<EmailTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [retryVersion, setRetryVersion] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetch('/api/marketing/templates', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { templates?: SavedTemplate[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load saved templates.')
        const mapped = (Array.isArray(payload.templates) ? payload.templates : []).flatMap((template) => {
          if (!template || typeof template.id !== 'string' || typeof template.name !== 'string') return []
          return [{
            id: `saved-${template.id}`,
            name: template.name,
            subject: template.subject || template.name,
            description: template.description || 'Saved Luxor email layout.',
            category: 'custom' as const,
            previewColor: template.preview_color || '#caa24c',
            blocks: Array.isArray(template.blocks) ? template.blocks as EmailTemplate['blocks'] : [],
            schemaVersion: 2 as const,
            preheader: typeof template.metadata?.preheader === 'string' ? template.metadata.preheader : '',
            theme: template.metadata?.theme && typeof template.metadata.theme === 'object'
              ? template.metadata.theme as EmailTemplate['theme']
              : undefined,
          }]
        })
        if (active) setSavedTemplates(mapped)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setSavedTemplates([])
          setError(loadError instanceof Error ? loadError.message : 'Unable to load saved templates.')
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retryVersion])

  return (
    <div className="min-h-0 flex-1 space-y-7 overflow-y-auto portal-scrollbar pb-8">
      <section className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">Email templates</p>
          <h2 className="mt-1 font-serif text-xl font-semibold text-[color:var(--portal-text)]">Starting points for a Luxor campaign.</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">Choose a starter or saved layout to open it in the existing Email Builder. Opening a template does not send it.</p>
        </div>
        <PortalButton variant="secondary" onClick={onOpenBuilder}><Plus size={13} /> Open blank builder</PortalButton>
      </section>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold text-[color:var(--portal-text)]">Saved templates could not load.</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{error} Starter templates remain available below.</p></div>
          <button type="button" onClick={() => setRetryVersion((value) => value + 1)} className="min-h-9 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-bold text-[color:var(--portal-text)] hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Try again</button>
        </div>
      ) : null}

      <TemplateSection title="Starter templates" detail="Built-in layouts included with the Email Builder.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EMAIL_TEMPLATES.map((template) => <TemplateCard key={template.id} template={template} label="Use template" onClick={() => onOpenTemplate(template)} />)}
        </div>
      </TemplateSection>

      <TemplateSection title="Saved templates" detail="Reusable layouts saved from the Email Builder.">
        {loading ? (
          <div role="status" aria-label="Loading saved templates" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><div className="h-3 w-2/3 rounded luxor-skeleton" /><div className="mt-3 h-2.5 w-full rounded luxor-skeleton" /><div className="mt-2 h-2.5 w-3/4 rounded luxor-skeleton" /></div>)}</div>
        ) : savedTemplates.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savedTemplates.map((template) => <TemplateCard key={template.id} template={template} label="Open in builder" onClick={() => onOpenTemplate(template)} />)}
          </div>
        ) : error ? null : (
          <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center text-xs leading-5 text-[color:var(--portal-muted)]">No saved templates yet. Build an email in the existing Email Builder and choose Save Template to add one here.</p>
        )}
      </TemplateSection>
    </div>
  )
}

function TemplateSection({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <section aria-label={title} className="space-y-3"><div><h3 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">{title}</h3><p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">{detail}</p></div>{children}</section>
}

function TemplateCard({ template, label, onClick }: { template: EmailTemplate; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-36 flex-col overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-left transition hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
      <span className="h-1.5 w-full" style={{ backgroundColor: template.previewColor || '#caa24c' }} />
      <span className="flex flex-1 items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#a8792f]"><LayoutTemplate size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(template.name)}</span>
            <span className="shrink-0 rounded-full border border-[color:var(--portal-border)] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">{template.category}</span>
          </span>
          <span className="mt-2 block text-[11px] leading-5 text-[color:var(--portal-muted)]">{template.description}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8792f]">{label} <ArrowUpRight size={12} /></span>
        </span>
      </span>
    </button>
  )
}
