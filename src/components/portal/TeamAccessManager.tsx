'use client'

import { useEffect, useState } from 'react'
import { Check, Plus, Shield, Users, X } from 'lucide-react'
import { useToast } from '@/components/portal/ToastProvider'

const GROUPS = [
  { label: 'CRM', items: [['leads', 'Leads & clients'], ['emails', 'Booking inbox'], ['calls', 'Phone & calls'], ['messages', 'Text messages'], ['calendar', 'Calendar'], ['events', 'Events']] },
  { label: 'Business', items: [['marketing', 'Marketing'], ['finances', 'Finances'], ['operations', 'Operations'], ['reports', 'Reports']] },
  { label: 'Workspace', items: [['settings', 'Settings'], ['team_access', 'Team access'], ['email_identity', 'Email sender identity'], ['phone_assignment', 'Phone line assignment']] },
] as const

type Member = { id: string; email: string; display_name: string; role: 'owner' | 'admin' | 'agent'; status: 'pending' | 'active' | 'suspended'; permissions: string[]; sender_email: string | null; assigned_phone_number_id: string | null }
type Phone = { id: string; phone_number: string; friendly_name: string | null }
const defaults = { admin: GROUPS.flatMap((group) => group.items.map(([id]) => id)), agent: ['leads', 'emails', 'calls', 'messages', 'calendar', 'events'] }

export function TeamAccessManager() {
  const { notify } = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [phones, setPhones] = useState<Phone[]>([])
  const [editing, setEditing] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ displayName: '', email: '', role: 'agent' as 'admin' | 'agent', permissions: defaults.agent, senderEmail: 'booking@luxoratlaspalmas.com', phoneNumberId: '' })

  const load = async () => {
    const response = await fetch('/api/portal/team-members')
    if (!response.ok) return
    const data = await response.json()
    setMembers(data.members || [])
    setPhones(data.phones || [])
  }
  useEffect(() => { void load() }, [])
  const beginEdit = (member: Member) => {
    setAdding(false); setEditing(member)
    setForm({ displayName: member.display_name, email: member.email, role: member.role === 'owner' ? 'agent' : member.role, permissions: member.permissions, senderEmail: member.sender_email || 'booking@luxoratlaspalmas.com', phoneNumberId: member.assigned_phone_number_id || '' })
  }
  const beginAdd = () => { setEditing(null); setAdding(true); setForm({ displayName: '', email: '', role: 'agent', permissions: defaults.agent, senderEmail: 'booking@luxoratlaspalmas.com', phoneNumberId: '' }) }
  const save = async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/portal/team-members', { method: adding ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(editing ? { id: editing.id, status: editing.status } : {}), ...form }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save team member.')
      notify({ title: adding ? 'Team member added. Send their invitation when you are ready.' : 'Access updated.', variant: 'success' })
      setEditing(null); setAdding(false); await load()
    } catch (error) { notify({ title: error instanceof Error ? error.message : 'Unable to save team member.', variant: 'error' }) } finally { setBusy(false) }
  }
  const sendInvite = async (member: Member) => {
    setBusy(true)
    try {
      const response = await fetch('/api/auth/portal-magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: member.email }) })
      if (!response.ok) throw new Error('Unable to send the sign-in link.')
      notify({ title: `Secure sign-in link sent to ${member.email}.`, variant: 'success' })
    } catch (error) { notify({ title: error instanceof Error ? error.message : 'Unable to send the sign-in link.', variant: 'error' }) } finally { setBusy(false) }
  }
  const toggle = (permission: string) => setForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }))
  const chooseRole = (role: 'admin' | 'agent') => setForm((current) => ({ ...current, role, permissions: defaults[role] }))
  const drawerOpen = adding || editing !== null
  return <div className="space-y-5">
    <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><h3 className="text-sm font-bold text-[color:var(--portal-text)]">People, roles & access</h3><p className="mt-1 max-w-xl text-xs leading-5 text-[color:var(--portal-muted)]">Control exactly what each person can open. Agents begin with the client-facing CRM only; you can adjust every permission.</p></div>
      <button type="button" onClick={beginAdd} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-white transition-colors hover:bg-[#dfbd68]"><Plus size={15} /> Add team member</button>
    </div>
    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
      <div className="hidden grid-cols-[minmax(14rem,1.2fr)_5.5rem_6rem_minmax(9rem,0.8fr)_6.5rem] gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-faint)] md:grid"><span>Person</span><span>Role</span><span>Status</span><span>Assigned line</span><span /></div>
      {members.map((member) => <div key={member.id} className="grid gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 last:border-0 md:grid-cols-[minmax(14rem,1.2fr)_5.5rem_6rem_minmax(9rem,0.8fr)_6.5rem] md:items-center">
        <div className="min-w-0"><p className="truncate text-sm font-bold text-[color:var(--portal-text)]">{member.display_name}</p><p className="truncate text-[11px] text-[color:var(--portal-muted)]">{member.email}</p></div>
        <p className="text-xs capitalize text-[color:var(--portal-text)]">{member.role}</p><p className={`text-xs ${member.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : member.status === 'suspended' ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>{member.status}</p>
        <p className="truncate text-xs text-[color:var(--portal-muted)]">{phones.find((phone) => phone.id === member.assigned_phone_number_id)?.phone_number || member.sender_email || 'Not assigned'}</p>
        {member.role === 'owner' ? <span className="text-[10px] font-semibold text-[color:var(--portal-faint)]">Owner</span> : <div className="flex gap-3"><button type="button" onClick={() => beginEdit(member)} className="justify-self-start text-xs font-bold text-[#a8792f] hover:text-[#caa24c]">Manage</button>{member.status === 'pending' ? <button type="button" disabled={busy} onClick={() => void sendInvite(member)} className="justify-self-start text-xs font-bold text-[#a8792f] hover:text-[#caa24c] disabled:opacity-50">Send link</button> : null}</div>}
      </div>)}
    </div>
    {drawerOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-stretch sm:justify-end sm:p-0" onMouseDown={() => { setAdding(false); setEditing(null) }}><section role="dialog" aria-modal="true" aria-label="Manage team access" onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-2xl sm:max-h-none sm:w-[32rem] sm:rounded-none">
      <div className="flex items-start justify-between"><div><h4 className="text-lg font-bold text-[color:var(--portal-text)]">{adding ? 'Add team member' : 'Manage access'}</h4><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{adding ? 'They will remain pending until you send an invitation.' : form.email}</p></div><button type="button" aria-label="Close" onClick={() => { setAdding(false); setEditing(null) }} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]"><X size={18} /></button></div>
      <div className="mt-6 space-y-4"><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm outline-none focus:border-[#caa24c]" /></label>{adding ? <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm outline-none focus:border-[#caa24c]" /></label> : null}
      <div><p className="text-xs font-semibold text-[color:var(--portal-text)]">Role</p><div className="mt-2 grid grid-cols-2 gap-2">{(['agent','admin'] as const).map((role) => <button type="button" key={role} onClick={() => chooseRole(role)} className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold capitalize ${form.role === role ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#a8792f]' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>{role}</button>)}</div></div>
      {GROUPS.map((group) => <div key={group.label} className="border-t border-[color:var(--portal-border)] pt-4"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">{group.label}</p><div className="mt-2 divide-y divide-[color:var(--portal-border)]">{group.items.map(([id,label]) => <button key={id} type="button" onClick={() => toggle(id)} className="flex w-full items-center gap-3 py-3 text-left"><span className={`inline-flex h-5 w-5 items-center justify-center rounded border ${form.permissions.includes(id) ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-transparent'}`}><Check size={13} /></span><span className="flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{label}</span></button>)}</div></div>)}
      <div className="flex gap-3 pt-2"><button type="button" onClick={() => { setAdding(false); setEditing(null) }} className="flex-1 rounded-lg border border-[color:var(--portal-border)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)]">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="flex-1 rounded-lg bg-[#caa24c] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save access'}</button></div></div>
    </section></div> : null}
  </div>
}
