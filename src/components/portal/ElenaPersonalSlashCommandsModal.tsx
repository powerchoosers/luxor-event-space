'use client'

import React, { useState } from 'react'
import type { ElenaSlashCommand } from '@/lib/luxorElenaSlashCommands'
import { loadPersonalElenaSlashCommands, savePersonalElenaSlashCommands } from '@/lib/luxorElenaSlashCommands'

export function ElenaPersonalSlashCommandsEditor({
  userEmail,
  onClose,
  onSaved,
  variant = 'modal',
}: {
  userEmail: string
  onClose: () => void
  onSaved: () => void
  variant?: 'modal' | 'inline'
}) {
  const compact = variant === 'inline'
  const [draft, setDraft] = useState<ElenaSlashCommand[]>(() => loadPersonalElenaSlashCommands(userEmail))
  const [error, setError] = useState('')

  const addRow = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: `personal-${crypto.randomUUID()}`,
        trigger: '',
        label: '',
        hint: '',
        scope: 'personal',
        prompt: '',
      },
    ])
  }

  const updateRow = (id: string, patch: Partial<ElenaSlashCommand>) => {
    setDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const removeRow = (id: string) => {
    setDraft((prev) => prev.filter((row) => row.id !== id))
  }

  const save = () => {
    const cleaned: ElenaSlashCommand[] = []
    const seen = new Set<string>()
    for (const row of draft) {
      const trigger = row.trigger.trim().toLowerCase().replace(/^\//, '').replace(/[^a-z0-9_-]/g, '')
      const label = row.label.trim()
      const prompt = row.prompt?.trim() || ''
      if (!trigger && !label && !prompt) continue
      if (!trigger || !label || !prompt) {
        setError('Each shortcut needs a trigger, label, and prompt.')
        return
      }
      if (trigger === 'ticket') {
        setError('/ticket is reserved as a system command.')
        return
      }
      if (seen.has(trigger)) {
        setError(`Duplicate trigger /${trigger}.`)
        return
      }
      seen.add(trigger)
      cleaned.push({
        id: row.id,
        trigger,
        label,
        hint: prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt,
        scope: 'personal',
        prompt,
      })
    }
    savePersonalElenaSlashCommands(userEmail, cleaned)
    onSaved()
    onClose()
  }

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
        {draft.length === 0 ? (
          <p className={compact ? 'text-[11px] text-[color:var(--portal-muted)]' : 'text-sm text-[color:var(--portal-muted)]'}>
            No personal shortcuts yet.
          </p>
        ) : (
          <ul className={compact ? 'space-y-2' : 'space-y-3'}>
            {draft.map((row) => (
              <li
                key={row.id}
                className={`rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] space-y-2 ${compact ? 'p-2.5' : 'p-3'}`}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[10px] font-semibold text-[color:var(--portal-muted)]">
                    Trigger
                    <input
                      value={row.trigger}
                      onChange={(event) => updateRow(row.id, { trigger: event.target.value })}
                      placeholder="brief"
                      className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold text-[color:var(--portal-muted)]">
                    Label
                    <input
                      value={row.label}
                      onChange={(event) => updateRow(row.id, { label: event.target.value })}
                      placeholder="Daily brief"
                      className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50"
                    />
                  </label>
                </div>
                <label className="block text-[10px] font-semibold text-[color:var(--portal-muted)]">
                  Prompt Elena sends
                  <textarea
                    value={row.prompt || ''}
                    onChange={(event) => updateRow(row.id, { prompt: event.target.value })}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="text-[10px] font-semibold text-red-600/80 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'pt-0.5' : 'pt-1'}`}>
          <button
            type="button"
            onClick={addRow}
            className={`rounded-lg border border-[color:var(--portal-border)] font-semibold text-[color:var(--portal-text)] ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
          >
            Add shortcut
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg font-semibold text-[color:var(--portal-muted)] ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className={`luxor-gold-raised rounded-lg font-bold !text-white ${compact ? 'px-3 py-1 text-[10px]' : 'px-4 py-1.5 text-xs'}`}
            >
              Save
            </button>
          </div>
        </div>
    </div>
  )
}
