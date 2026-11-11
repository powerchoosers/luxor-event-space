'use client'

import { useEffect, useState } from 'react'
import { Check, KeyRound, LogOut, Plus, Send } from '@/lib/icons/phosphor-compat'
import {
  PortalButton,
  PortalModal,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

const GROUPS = [
  {
    label: 'CRM',
    items: [
      ['leads', 'Leads & clients'],
      ['emails', 'Booking inbox'],
      ['calls', 'Phone & calls'],
      ['messages', 'Text messages'],
      ['calendar', 'Calendar'],
    ],
  },
  { label: 'Planning', items: [['planner', 'Planner · all event workspaces']] },
  {
    label: 'Business',
    items: [
      ['marketing', 'Marketing'],
      ['finances', 'Finances'],
      ['operations', 'Operations'],
      ['reports', 'Reports'],
    ],
  },
  {
    label: 'Workspace',
    items: [
      ['settings', 'Settings'],
      ['team_access', 'Team access'],
      ['email_identity', 'Email sender identity'],
      ['phone_assignment', 'Phone line assignment'],
    ],
  },
] as const

type Member = {
  id: string
  email: string
  recovery_email: string | null
  auth_user_id: string | null
  display_name: string
  role_title: string
  avatar_url: string | null
  role: 'owner' | 'admin' | 'agent'
  status: 'pending' | 'active' | 'suspended'
  permissions: string[]
  sender_email: string | null
  assigned_phone_number_id: string | null
  invited_at: string | null
  password_set_at: string | null
  password_reset_sent_at: string | null
  sessions_revoked_at: string | null
}

type Phone = { id: string; phone_number: string; friendly_name: string | null }

const defaults = {
  admin: GROUPS.flatMap((group) => group.items.map(([id]) => id)),
  agent: ['leads', 'emails', 'calls', 'messages', 'calendar', 'planner'],
}

const INPUT_CLASS =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

export function TeamAccessManager() {
  const { notify } = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    displayName: '',
    roleTitle: '',
    avatarUrl: '',
    email: '',
    recoveryEmail: '',
    role: 'agent' as 'admin' | 'agent',
    permissions: defaults.agent,
    senderEmail: 'booking@luxoratlaspalmas.com',
    phoneNumberId: '',
  })

  const load = async () => {
    try {
      const response = await fetch('/api/portal/team-members')
      if (!response.ok) return
      const data = await response.json()
      setMembers(data.members || [])
      setPhones(data.phones || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const closeDrawer = () => {
    setDrawerOpen(false)
  }

  const beginEdit = (member: Member) => {
    setAdding(false)
    setEditing(member)
    setForm({
      displayName: member.display_name,
      roleTitle: member.role_title || '',
      avatarUrl: member.avatar_url || '',
      email: member.email,
      recoveryEmail: member.recovery_email || '',
      role: member.role === 'owner' ? 'agent' : member.role,
      permissions: [...new Set([...member.permissions, 'planner'])],
      senderEmail: member.sender_email || 'booking@luxoratlaspalmas.com',
      phoneNumberId: member.assigned_phone_number_id || '',
    })
    setDrawerOpen(true)
  }

  const beginAdd = () => {
    setEditing(null)
    setAdding(true)
    setForm({
      displayName: '',
      roleTitle: '',
      avatarUrl: '',
      email: '',
      recoveryEmail: '',
      role: 'agent',
      permissions: defaults.agent,
      senderEmail: 'booking@luxoratlaspalmas.com',
      phoneNumberId: '',
    })
    setDrawerOpen(true)
  }

  const deliverInvite = async (email: string, purpose: 'activation' | 'password_reset' = 'activation') => {
    if (purpose === 'activation') {
      const member = members.find((item) => item.email === email)
      if (member && !member.auth_user_id) {
        const repair = await fetch('/api/portal/team-members', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: member.id, action: 'repair_identity' }),
        })
        const repairData = await repair.json().catch(() => ({}))
        if (!repair.ok) throw new Error(repairData.error || 'Unable to repair the secure login identity.')
      }
    }
    const response = await fetch('/api/auth/portal-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Unable to send the sign-in link.')
  }

  const save = async (sendInvitation = false) => {
    const wasAdding = adding
    setBusy(true)
    try {
      const response = await fetch('/api/portal/team-members', {
        method: wasAdding ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editing ? { id: editing.id, status: editing.status } : {}), ...form }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save team member.')
      if (wasAdding && sendInvitation) {
        try {
          await deliverInvite(data.member?.email || form.email)
        } catch (error) {
          closeDrawer()
          await load()
          notify({
            title: 'Team member added, but the invitation was not sent.',
            description: error instanceof Error ? error.message : 'Use Send invite beside their pending profile to try again.',
            variant: 'error',
          })
          return
        }
      }
      notify({
        title: wasAdding
          ? sendInvitation
            ? `Invitation sent to ${data.member?.email || form.email}.`
            : 'Team member saved as pending.'
          : 'Access updated.',
        description: wasAdding && sendInvitation ? 'Activation email delivered via Resend.' : undefined,
        variant: 'success',
      })
      closeDrawer()
      await load()
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Unable to save team member.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const sendInvite = async (member: Member) => {
    setBusy(true)
    try {
      await deliverInvite(member.email)
      await load()
      notify({
        title: `Sign-in link sent to ${member.email}.`,
        description: 'Activation email delivered via Resend.',
        variant: 'success',
      })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Unable to send the sign-in link.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (member: Member) => {
    setBusy(true)
    try {
      await deliverInvite(member.email, 'password_reset')
      await load()
      notify({ title: `Password reset sent to ${member.recovery_email}.`, variant: 'success' })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Unable to send the password reset.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const revokeSessions = async (member: Member) => {
    setBusy(true)
    try {
      const response = await fetch('/api/portal/team-members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, action: 'revoke_sessions' }),
      })
      if (!response.ok) throw new Error('Unable to revoke sessions.')
      await load()
      notify({ title: `Signed ${member.display_name} out on all devices.`, variant: 'success' })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Unable to revoke sessions.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const toggle = (permission: string) => {
    if (permission === 'planner') return
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  const chooseRole = (role: 'admin' | 'agent') =>
    setForm((current) => ({ ...current, role, permissions: defaults[role] }))

  const ownerReadOnly = !adding && editing?.role === 'owner'
  const canCreate =
    form.displayName.trim().length > 0 &&
    form.roleTitle.trim().length > 0 &&
    /^[a-z0-9][a-z0-9._-]*@luxoratlaspalmas\.com$/i.test(form.email.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recoveryEmail.trim()) &&
    form.email.trim().toLowerCase() !== form.recoveryEmail.trim().toLowerCase()

  const drawerFooter = ownerReadOnly ? (
    <PortalButton type="button" variant="primary" onClick={closeDrawer} className="w-full">
      Close
    </PortalButton>
  ) : adding ? (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <PortalButton type="button" variant="secondary" disabled={busy || !canCreate} onClick={() => void save(false)}>
        Save as pending
      </PortalButton>
      <PortalButton type="button" variant="primary" disabled={busy || !canCreate} onClick={() => void save(true)}>
        <Send size={14} />
        {busy ? 'Sending…' : 'Add & send invite'}
      </PortalButton>
    </div>
  ) : (
    <div className="flex gap-2.5">
      <PortalButton type="button" variant="secondary" onClick={closeDrawer} className="flex-1">
        Cancel
      </PortalButton>
      <PortalButton type="button" variant="primary" disabled={busy} onClick={() => void save()} className="flex-1">
        {busy ? 'Saving…' : 'Save access'}
      </PortalButton>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Team members &amp; access</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            Invite staff and choose which portal tools they can open.
          </p>
        </div>
        <PortalButton type="button" variant="primary" onClick={beginAdd} className="w-full shrink-0 sm:w-auto">
          <Plus size={15} />
          Add team member
        </PortalButton>
      </div>

      <PortalSkeletonTransition
        loading={loading}
        overlap
        skeleton={
          <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex flex-col gap-3 bg-[color:var(--portal-card)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <PortalSkeleton className="h-4 w-40 rounded-md" />
                    <PortalSkeleton className="h-3.5 w-56 max-w-full rounded-md" />
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <PortalSkeleton className="h-5 w-16 rounded-md" />
                  <PortalSkeleton className="h-8 w-20 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        }
      >
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-6 text-center text-xs text-[color:var(--portal-muted)]">
            No team members added yet.
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35">
            {members.map((member) => {
              const assignedLine =
                phones.find((phone) => phone.id === member.assigned_phone_number_id)?.phone_number ||
                member.sender_email ||
                'No line assigned'
              const initials = member.display_name
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 bg-[color:var(--portal-card)] p-4 transition-colors hover:bg-[color:var(--portal-soft)]/45 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button
                    type="button"
                    onClick={() => beginEdit(member)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/25 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-xs font-bold text-[#18130d]"
                      style={member.avatar_url ? { backgroundImage: `url(${member.avatar_url})` } : undefined}
                    >
                      {member.avatar_url ? '' : initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[color:var(--portal-text)]">
                          {member.display_name}
                        </span>
                        <span className="text-xs capitalize text-[color:var(--portal-muted)]">· {member.role}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[color:var(--portal-muted)]">
                        {member.email} · {assignedLine}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <PortalStatusBadge status={member.status} borderless />
                    {member.role === 'owner' ? (
                      <PortalButton type="button" variant="ghost" size="sm" onClick={() => beginEdit(member)}>
                        View profile
                      </PortalButton>
                    ) : (
                      <>
                        <PortalButton type="button" variant="secondary" size="sm" onClick={() => beginEdit(member)}>
                          Manage
                        </PortalButton>
                        {member.status === 'pending' ? (
                          <PortalButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void sendInvite(member)}
                          >
                            {member.invited_at ? 'Resend invite' : 'Send invite'}
                          </PortalButton>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PortalSkeletonTransition>

      <PortalModal
        isOpen={drawerOpen}
        onClose={closeDrawer}
        sidePanel
        maxWidth="max-w-lg"
        title={adding ? 'Add team member' : ownerReadOnly ? 'Owner profile' : 'Manage access'}
        description={
          adding
            ? 'Assign a Luxor login and send activation to their private recovery email.'
            : form.email
        }
        footer={drawerFooter}
      >
        {ownerReadOnly ? (
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <p className="text-sm font-semibold text-[color:var(--portal-text)]">{editing?.display_name}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">
              Owner permissions are protected. Update your name, photo, and title in the Your profile card above.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Name</span>
                <input
                  value={form.displayName}
                  maxLength={100}
                  placeholder="Full name"
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Title</span>
                <input
                  value={form.roleTitle}
                  maxLength={120}
                  placeholder="Venue Manager"
                  onChange={(event) => setForm({ ...form, roleTitle: event.target.value })}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Profile photo URL (optional)</span>
              <input
                type="url"
                value={form.avatarUrl}
                placeholder="https://…"
                onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })}
                className={INPUT_CLASS}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Luxor login address</span>
              <div className="flex min-h-10 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] transition-colors focus-within:border-[#caa24c]/50 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/15">
                <input
                  autoComplete="off"
                  placeholder="first.last"
                  value={form.email.replace(/@.*$/, '')}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: `${event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@luxoratlaspalmas.com`,
                    })
                  }
                  className="portal-input-transparent min-w-0 flex-1 bg-transparent px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]"
                />
                <span className="flex items-center border-l border-[color:var(--portal-border)] px-3 text-xs text-[color:var(--portal-muted)]">
                  @luxoratlaspalmas.com
                </span>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Private recovery email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@gmail.com"
                value={form.recoveryEmail}
                onChange={(event) => setForm({ ...form, recoveryEmail: event.target.value })}
                className={INPUT_CLASS}
              />
              <span className="block text-xs text-[color:var(--portal-muted)]">
                Activation links and password resets are sent here.
              </span>
            </label>

            {!adding ? (
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">Password &amp; sessions</p>
                <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                  {editing?.password_set_at
                    ? `Password set ${new Date(editing.password_set_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}.`
                    : 'Password not set yet.'}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <PortalButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy || !form.recoveryEmail}
                    onClick={() => editing && void resetPassword(editing)}
                  >
                    <KeyRound size={14} />
                    Send reset
                  </PortalButton>
                  <PortalButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => editing && void revokeSessions(editing)}
                  >
                    <LogOut size={14} />
                    Sign out devices
                  </PortalButton>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[color:var(--portal-muted)]">Role</p>
              <div className="grid grid-cols-2 gap-2.5">
                {(['agent', 'admin'] as const).map((role) => {
                  const active = form.role === role
                  return (
                    <button
                      type="button"
                      key={role}
                      onClick={() => chooseRole(role)}
                      className={`rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold capitalize transition-colors ${
                        active
                          ? 'border-[#caa24c]/50 bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/30 hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      {role}
                    </button>
                  )
                })}
              </div>
            </div>

            {GROUPS.map((group) => (
              <div key={group.label} className="border-t border-[color:var(--portal-border)] pt-4">
                <p className="text-xs font-semibold text-[color:var(--portal-muted)]">{group.label}</p>
                <div className="mt-2 divide-y divide-[color:var(--portal-border)]">
                  {group.items.map(([id, label]) => {
                    const checked = form.permissions.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(id)}
                        disabled={id === 'planner'}
                        className={`flex w-full items-center gap-3 py-2.5 text-left ${id === 'planner' ? 'cursor-default opacity-80' : ''}`}
                      >
                        <span
                          className={`inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? 'border-[#caa24c] bg-[#caa24c]'
                              : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-transparent'
                          }`}
                        >
                          {checked ? (
                            <Check size={12} strokeWidth={3} style={{ color: '#ffffff', stroke: '#ffffff' }} />
                          ) : null}
                        </span>
                        <span className="flex-1 text-sm font-medium text-[color:var(--portal-text)]">{label}</span>
                        {id === 'planner' ? (
                          <span className="text-xs text-[color:var(--portal-muted)]">Required</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </PortalModal>
    </div>
  )
}
