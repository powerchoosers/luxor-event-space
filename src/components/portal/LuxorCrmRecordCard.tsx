'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { PortalContactAvatar, PortalStatusBadge, type PortalStatusTone } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

export type LuxorCrmCardBadge = {
  label: string
  tone: PortalStatusTone
  warning?: boolean
}

export function luxorCrmStatusTone(value: string): PortalStatusTone {
  const status = value.trim().toLowerCase().replaceAll('_', ' ')
  if (status === 'sent') return 'blue'
  if (status === 'booked' || /(completed|attended|signed|paid|successful|closed won)/.test(status)) return 'green'
  if (status === 'closed lost') return 'neutral'
  if (/(overdue|no show|issue|needs attention|failed|lost)/.test(status)) return 'red'
  if (/(today|active|in progress|scheduled)/.test(status)) return 'blue'
  if (/(upcoming|booked|milestone|pending|needs outcome)/.test(status)) return 'gold'
  if (/(post tour|post-tour|new lead|nurture|lifecycle)/.test(status)) return 'purple'
  return 'neutral'
}

/** Shared Luxor record-card frame for CRM tabs; tab-specific details/actions are slots. */
export function LuxorCrmRecordCard({
  lead,
  avatar,
  badges,
  subtitle,
  contact,
  children,
  actions,
  contentColumn = false,
  onOpen,
  className = '',
  selected = false,
}: {
  lead: LuxorInquiry
  avatar?: ReactNode
  badges?: LuxorCrmCardBadge[]
  subtitle?: ReactNode
  contact?: ReactNode
  contentColumn?: boolean
  children?: ReactNode
  actions?: ReactNode
  onOpen?: () => void
  className?: string
  selected?: boolean
}) {
  return (
    <article
      className={`portal-card-surface relative rounded-xl border p-4 shadow-sm transition-colors ${onOpen ? 'cursor-pointer hover:border-[#caa24c]/60' : ''} ${selected ? 'border-[#caa24c]/60 bg-[#caa24c]/[0.04]' : ''} ${className}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a,button,input,select,textarea,[role="menuitem"]')) return
        onOpen?.()
      }}
    >
      {onOpen ? <button
        type="button"
        aria-label={`Open ${lead.full_name}`}
        onClick={onOpen}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a8792f]"
      /> : null}
      <div className="relative z-10">
        <div className="flex min-w-0 items-start gap-3">
          {avatar ?? <PortalContactAvatar
            name={lead.full_name}
            avatarUrl={lead.metadata?.avatar_url as string | null}
            size="md"
            className="shrink-0"
          />}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold leading-tight text-[color:var(--portal-text)]">{lead.full_name}</h3>
                {subtitle ? <div className="mt-0.5 break-words text-xs text-[color:var(--portal-muted)]">{subtitle}</div> : null}
              </div>
              {badges?.length ? (
                <div className="flex max-w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                  {badges.map((badge, index) => <PortalStatusBadge key={`${badge.label}-${index}`} status={badge.label} tone={badge.tone} warning={badge.warning} />)}
                </div>
              ) : null}
            </div>
            {contact ? <div className="mt-1 break-all text-[10px] text-[color:var(--portal-muted)]">{contact}</div> : null}
            {contentColumn && children ? <div className="mt-3 space-y-2 text-sm">{children}</div> : null}
            {contentColumn && actions ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">{actions}</div> : null}
          </div>
        </div>
        {!contentColumn && children ? <div className="mt-3 space-y-2 text-sm">{children}</div> : null}
        {!contentColumn && actions ? <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">{actions}</div> : null}
      </div>
    </article>
  )
}

export function LuxorCrmPrimaryAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white transition-colors hover:bg-[#916825] disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ''}`}>{children}</button>
}

export function LuxorCrmSecondaryAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ''}`}>{children}</button>
}
