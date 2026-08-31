'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Plus, Send, X } from 'lucide-react'
import { useToast } from '@/components/portal/ToastProvider'

const GROUPS = [
  { label: 'CRM', items: [['leads', 'Leads & clients'], ['emails', 'Booking inbox'], ['calls', 'Phone & calls'], ['messages', 'Text messages'], ['calendar', 'Calendar'], ['events', 'Events']] },
  { label: 'Business', items: [['marketing', 'Marketing'], ['finances', 'Finances'], ['operations', 'Operations'], ['reports', 'Reports']] },
  { label: 'Workspace', items: [['settings', 'Settings'], ['team_access', 'Team access'], ['email_identity', 'Email sender identity'], ['phone_assignment', 'Phone line assignment']] },
] as const

type Member = { id: string; email: string; display_name: string; role: 'owner' | 'admin' | 'agent'; status: 'pending' | 'active' | 'suspended'; permissions: string[]; sender_email: string | null; assigned_phone_number_id: string | null; invited_at: string | null }
type Phone = { id: string; phone_number: string; friendly_name: string | null }
const defaults = { admin: GROUPS.flatMap((group) => group.items.map(([id]) => id)), agent: ['leads', 'emails', 'calls', 'messages', 'calendar', 'events'] }

export function TeamAccessManager() {
  const { notify } = useToast()
  const reduceMotion = useReducedMotion()
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
  const deliverInvite = async (email: string) => {
    const response = await fetch('/api/auth/portal-magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Unable to send the sign-in link.')
  }
  const save = async (sendInvitation = false) => {
    const wasAdding = adding
    setBusy(true)
    try {
      const response = await fetch('/api/portal/team-members', { method: wasAdding ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(editing ? { id: editing.id, status: editing.status } : {}), ...form }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save team member.')
      if (wasAdding && sendInvitation) {
        try {
          await deliverInvite(data.member?.email || form.email)
        } catch (error) {
          setEditing(null); setAdding(false); await load()
          notify({ title: 'Team member added, but the invitation was not sent.', description: error instanceof Error ? error.message : 'Use Send invite beside their pending profile to try again.', variant: 'error' })
          return
        }
      }
      notify({
        title: wasAdding ? (sendInvitation ? `Invitation sent to ${data.member?.email || form.email}.` : 'Team member saved as pending.') : 'Access updated.',
        description: wasAdding && sendInvitation ? 'Resend delivered the secure sign-in link and Supabase recorded it.' : undefined,
        variant: 'success',
      })
      setEditing(null); setAdding(false); await load()
    } catch (error) { notify({ title: error instanceof Error ? error.message : 'Unable to save team member.', variant: 'error' }) } finally { setBusy(false) }
  }
  const sendInvite = async (member: Member) => {
    setBusy(true)
    try {
      await deliverInvite(member.email)
      await load()
      notify({ title: `Secure sign-in link sent to ${member.email}.`, description: 'Resend delivered the invitation and Supabase recorded it.', variant: 'success' })
    } catch (error) { notify({ title: error instanceof Error ? error.message : 'Unable to send the sign-in link.', variant: 'error' }) } finally { setBusy(false) }
  }
  const toggle = (permission: string) => setForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }))
  const chooseRole = (role: 'admin' | 'agent') => setForm((current) => ({ ...current, role, permissions: defaults[role] }))
  const drawerOpen = adding || editing !== null
  const ownerReadOnly = editing?.role === 'owner'
  const canCreate = form.displayName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  useEffect(() => {
    if (!drawerOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = originalOverflow }
  }, [drawerOpen])
  return <div className="space-y-5">
    <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><h3 className="text-sm font-bold text-[color:var(--portal-text)]">People, roles & access</h3><p className="mt-1 max-w-xl text-xs leading-5 text-[color:var(--portal-muted)]">Control exactly what each person can open. Agents begin with the client-facing CRM only; you can adjust every permission.</p></div>
      <button type="button" onClick={beginAdd} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-white transition-colors hover:bg-[#dfbd68]"><Plus size={15} /> Add team member</button>
    </div>
    <div className="rounded-xl border border-[color:var(--portal-border)]">
      <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 md:hidden"><span className="text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-faint)]">People</span><span className="text-[10px] text-[color:var(--portal-muted)]">Swipe to view access</span></div>
      <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        <div className="min-w-[43rem]">
          <div className="grid grid-cols-[minmax(14rem,1.2fr)_5.5rem_6rem_minmax(9rem,0.8fr)_6.5rem] gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-faint)]"><span>Person</span><span>Role</span><span>Status</span><span>Assigned line</span><span /></div>
          {members.map((member) => <div key={member.id} className="grid grid-cols-[minmax(14rem,1.2fr)_5.5rem_6rem_minmax(9rem,0.8fr)_6.5rem] items-center gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 last:border-0">
        <button type="button" onClick={() => beginEdit(member)} className="min-w-0 text-left outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><p className="truncate text-sm font-bold text-[color:var(--portal-text)] underline-offset-4 hover:text-[#a8792f] hover:underline">{member.display_name}</p><p className="truncate text-[11px] text-[color:var(--portal-muted)]">{member.email}</p></button>
        <p className="text-xs capitalize text-[color:var(--portal-text)]">{member.role}</p><p className={`text-xs ${member.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : member.status === 'suspended' ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>{member.status}</p>
        <p className="truncate text-xs text-[color:var(--portal-muted)]">{phones.find((phone) => phone.id === member.assigned_phone_number_id)?.phone_number || member.sender_email || 'Not assigned'}</p>
        {member.role === 'owner' ? <button type="button" onClick={() => beginEdit(member)} className="justify-self-start text-xs font-semibold text-[color:var(--portal-faint)] hover:text-[#a8792f]">View profile</button> : <div className="flex gap-3"><button type="button" onClick={() => beginEdit(member)} className="justify-self-start text-xs font-bold text-[#a8792f] hover:text-[#caa24c]">Manage</button>{member.status === 'pending' ? <button type="button" disabled={busy} onClick={() => void sendInvite(member)} className="justify-self-start text-xs font-bold text-[#a8792f] hover:text-[#caa24c] disabled:opacity-50">{member.invited_at ? 'Resend invite' : 'Send invite'}</button> : null}</div>}
      </div>)}
        </div>
      </div>
    </div>
    {typeof document !== 'undefined' ? createPortal(<AnimatePresence>{drawerOpen ? <motion.div key="team-access-drawer" className="portal-modal-layer fixed inset-0 z-[100] flex items-end bg-black/20 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md dark:bg-black/55 sm:items-stretch sm:justify-end sm:p-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0.08 : 0.2, ease: [0.23, 1, 0.32, 1] }} onMouseDown={() => { setAdding(false); setEditing(null) }}><motion.section role="dialog" aria-modal="true" aria-label="Manage team access" onMouseDown={(event) => event.stopPropagation()} initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 36, y: 10, scale: 0.995 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, y: 8, scale: 0.995 }} transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }} className="portal-sheet flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[#fffdf9] shadow-2xl will-change-transform dark:bg-[#0e0d0b] sm:h-full sm:max-h-none sm:w-[min(32rem,calc(100vw-1rem))] sm:rounded-none">
      <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[#fffdf9] px-5 py-4 dark:bg-[#0e0d0b] sm:pt-[max(1rem,env(safe-area-inset-top))]"><div><h4 className="text-lg font-bold text-[color:var(--portal-text)]">{adding ? 'Add team member' : ownerReadOnly ? 'Owner profile' : 'Manage access'}</h4><p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--portal-muted)]">{adding ? 'Enter the email they will use to sign in, then send their secure invitation through Resend.' : form.email}</p></div><button type="button" aria-label="Close" onClick={() => { setAdding(false); setEditing(null) }} className="shrink-0 rounded-lg p-2 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)]"><X size={18} /></button></div>
      {ownerReadOnly ? <><div className="portal-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"><div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><p className="text-sm font-semibold text-[color:var(--portal-text)]">{editing?.display_name}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Owner accounts keep their protected access. Use the profile section above to change this owner’s name, photo, and email signature.</p></div></div><div className="relative z-10 shrink-0 border-t border-[color:var(--portal-border)] bg-[#fffdf9] px-5 py-4 dark:bg-[#0e0d0b] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"><button type="button" onClick={() => setEditing(null)} className="w-full rounded-lg bg-[#caa24c] px-4 py-3 text-xs font-bold text-white">Close</button></div></> : <><div className="portal-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"><div className="space-y-4"><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm outline-none focus:border-[#caa24c]" /></label>{adding ? <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Portal sign-in email<input type="email" autoComplete="email" placeholder="name@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm outline-none focus:border-[#caa24c]" /><span className="mt-2 block text-[11px] font-normal leading-4 text-[color:var(--portal-muted)]">Use an email they already receive. Resend delivers the sign-in link; it does not create a mailbox.</span></label> : null}
      <div><p className="text-xs font-semibold text-[color:var(--portal-text)]">Role</p><div className="mt-2 grid grid-cols-2 gap-2">{(['agent','admin'] as const).map((role) => <button type="button" key={role} onClick={() => chooseRole(role)} className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold capitalize ${form.role === role ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#a8792f]' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>{role}</button>)}</div></div>
      {GROUPS.map((group) => <div key={group.label} className="border-t border-[color:var(--portal-border)] pt-4"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">{group.label}</p><div className="mt-2 divide-y divide-[color:var(--portal-border)]">{group.items.map(([id,label]) => <button key={id} type="button" onClick={() => toggle(id)} className="flex w-full items-center gap-3 py-3 text-left"><span className={`inline-flex h-5 w-5 items-center justify-center rounded border ${form.permissions.includes(id) ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-transparent'}`}><Check size={13} /></span><span className="flex-1 text-sm font-semibold text-[color:var(--portal-text)]">{label}</span></button>)}</div></div>)}</div></div>
      <div className="relative z-10 shrink-0 border-t border-[color:var(--portal-border)] bg-[#fffdf9] px-5 py-4 dark:bg-[#0e0d0b] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">{adding ? <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy || !canCreate} onClick={() => void save(false)} className="rounded-lg border border-[color:var(--portal-border)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-45">Save as pending</button><button type="button" disabled={busy || !canCreate} onClick={() => void save(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Send size={14} />{busy ? 'Sending…' : 'Add & send invite'}</button></div> : <div className="flex gap-3"><button type="button" onClick={() => { setAdding(false); setEditing(null) }} className="flex-1 rounded-lg border border-[color:var(--portal-border)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)]">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="flex-1 rounded-lg bg-[#caa24c] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save access'}</button></div>}</div></>}
    </motion.section></motion.div> : null}</AnimatePresence>, document.body) : null}
  </div>
}
