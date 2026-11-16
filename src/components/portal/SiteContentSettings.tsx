'use client'

import { useEffect, useState } from 'react'
import { defaultWebsiteContent, parseWebsiteContent } from '@/lib/publicWebsiteContent'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'

type Destination = 'brochure' | 'packages' | 'visit'
type Actions = typeof defaultWebsiteContent
const options = [ { value: 'brochure', label: 'Venue brochure' }, { value: 'packages', label: 'Packages and pricing' }, { value: 'visit', label: 'Schedule a visit' } ]
const valid = (value: unknown): value is Destination => value === 'brochure' || value === 'packages' || value === 'visit'

export function SiteContentSettings() {
  const [actions, setActions] = useState<Actions>(defaultWebsiteContent)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    fetch('/api/public/content?page=public_actions', { cache: 'no-store' }).then(async (res) => {
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Could not load website settings. Try reopening Settings.')
      return res.json()
    }).then((data) => {
      if (data) setActions(parseWebsiteContent(data))
    }).catch((error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])
  async function save() {
    setSaving(true); setMessage('')
    try {
      const res = await fetch('/api/portal/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_name: 'public_actions', content: actions }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save changes.')
      setMessage('Saved. Visitors will see these choices when they load the site.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save changes.') }
    finally { setSaving(false) }
  }
  return <section className="space-y-5 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
    <div><h3 className="text-base font-bold text-[color:var(--portal-text)]">Website buttons</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Choose where visitors go when they select these actions.</p></div>
    <div className="space-y-2"><label className="block text-sm font-semibold text-[color:var(--portal-text)]">Homepage video button</label><PortalSelect aria-label="Homepage video button destination" value={actions.hero} options={options} onChange={(value) => { if (valid(value)) setActions({ ...actions, hero: value }); setMessage('') }} disabled={loading || saving} /><p className="text-xs text-[color:var(--portal-muted)]">The brochure choice scrolls to the form at the bottom of the homepage.</p></div>
    <div className="space-y-2"><label className="block text-sm font-semibold text-[color:var(--portal-text)]">Other brochure links</label><PortalSelect aria-label="Other brochure links destination" value={actions.other} options={options} onChange={(value) => { if (valid(value)) setActions({ ...actions, other: value }); setMessage('') }} disabled={loading || saving} /><p className="text-xs text-[color:var(--portal-muted)]">Applies to the event page and Elena’s welcome actions.</p></div>
    <div className="border-t border-[color:var(--portal-border)] pt-5 space-y-4">
      <div><h3 className="text-base font-bold text-[color:var(--portal-text)]">Homepage introduction</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Shown below the homepage video. Changes apply to the English homepage.</p></div>
      <label className="block space-y-2 text-sm font-semibold text-[color:var(--portal-text)]">Headline<input value={actions.headline} maxLength={100} disabled={loading || saving} onChange={(event) => { setActions({ ...actions, headline: event.target.value }); setMessage('') }} className="block min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-base text-[color:var(--portal-text)] focus:outline-2 focus:outline-[#caa24c]" /><span className="block text-xs font-normal text-[color:var(--portal-muted)]">{actions.headline.length}/100 characters</span></label>
      <label className="block space-y-2 text-sm font-semibold text-[color:var(--portal-text)]">Introduction<textarea value={actions.introduction} maxLength={240} rows={3} disabled={loading || saving} onChange={(event) => { setActions({ ...actions, introduction: event.target.value }); setMessage('') }} className="block w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-base text-[color:var(--portal-text)] focus:outline-2 focus:outline-[#caa24c]" /><span className="block text-xs font-normal text-[color:var(--portal-muted)]">{actions.introduction.length}/240 characters</span></label>
    </div>
    <PortalButton variant="primary" onClick={() => void save()} disabled={loading || saving || message.startsWith('Could not load') || !actions.headline.trim() || !actions.introduction.trim()}>{saving ? 'Saving…' : 'Save changes'}</PortalButton>
    {message && <p role="status" className="text-sm text-[color:var(--portal-text)]">{message}</p>}
  </section>
}
