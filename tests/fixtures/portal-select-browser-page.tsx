'use client'

import { useEffect, useState } from 'react'
import { PortalSelect } from '@/components/portal/PortalUI'

const OPTIONS = [
  { value: 'all', label: 'All event types' },
  { value: 'quince', label: 'Quinceañera' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'corporate', label: 'Corporate event' },
  { value: 'birthday', label: 'Birthday' },
]

export default function PortalSelectBrowserFixture() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [value, setValue] = useState('all')

  useEffect(() => {
    document.body.setAttribute('data-portal-theme', theme)
    return () => document.body.removeAttribute('data-portal-theme')
  }, [theme])

  return (
    <main
      className="min-h-[100dvh] p-6 sm:p-10"
      style={{
        background: 'var(--portal-bg)',
        color: 'var(--portal-text)',
      }}
    >
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setTheme('light')}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold"
        >
          Portal light
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold"
        >
          Portal dark
        </button>
        <p className="text-xs text-[color:var(--portal-muted)]">Selected: {value}</p>
      </div>
      <div className="relative z-0 max-w-md rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Event type filter</p>
        <PortalSelect value={value} onChange={setValue} options={OPTIONS} className="w-full" aria-label="Event type filter" />
      </div>
      <div className="mt-10 space-y-1 text-sm text-[color:var(--portal-muted)]">
        {Array.from({ length: 24 }, (_, index) => (
          <p key={index}>
            Underlying portal ledger line {index + 1}: proposal totals, package tiers, and guest counts should not show through the menu.
          </p>
        ))}
      </div>
    </main>
  )
}
