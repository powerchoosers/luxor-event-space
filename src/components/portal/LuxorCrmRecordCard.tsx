'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
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
  headerAction,
  subtitle,
  contact,
  children,
  actions,
  contentColumn = false,
  responsiveContentColumn = false,
  onOpen,
  headerHref,
  expanded,
  expandedContentId,
  interactionLabel,
  className = '',
  selected = false,
  listFlush = false,
  listFlushEnd = false,
}: {
  lead: LuxorInquiry
  avatar?: ReactNode
  badges?: LuxorCrmCardBadge[]
  headerAction?: ReactNode
  subtitle?: ReactNode
  contact?: ReactNode
  contentColumn?: boolean
  responsiveContentColumn?: boolean
  children?: ReactNode
  actions?: ReactNode
  onOpen?: () => void
  headerHref?: string
  expanded?: boolean
  expandedContentId?: string
  interactionLabel?: string
  className?: string
  selected?: boolean
  listFlush?: boolean
  listFlushEnd?: boolean
}) {
  const cardAvatar = avatar ?? <PortalContactAvatar
    name={lead.full_name}
    avatarUrl={lead.metadata?.avatar_url as string | null}
    size="md"
    className="shrink-0"
  />
  return (
    <article
      className={`portal-card-surface group relative border p-4 transition-[border-color,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${listFlush ? `max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:shadow-none${listFlushEnd ? ' max-md:rounded-b-2xl max-md:border-b-0' : ''}` : 'rounded-xl shadow-sm'} ${onOpen ? `cursor-pointer ${listFlush ? 'md:hover:-translate-y-0.5 hover:border-[#caa24c]/70 hover:bg-[#caa24c]/[0.035] dark:hover:bg-[#caa24c]/[0.06] md:hover:shadow-md md:active:translate-y-0' : 'sm:hover:-translate-y-0.5 hover:border-[#caa24c]/70 hover:bg-[#caa24c]/[0.035] dark:hover:bg-[#caa24c]/[0.06] hover:shadow-md sm:active:translate-y-0'}` : ''} ${selected || expanded ? 'border-[#caa24c]/55 bg-[#caa24c]/[0.025] dark:bg-[#caa24c]/[0.05]' : ''} ${className}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a,button,input,select,textarea,[role="menuitem"]')) return
        onOpen?.()
      }}
    >
      {onOpen ? <button
        type="button"
        aria-label={interactionLabel ?? `Open ${lead.full_name}`}
        aria-expanded={expanded}
        aria-controls={expandedContentId}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
        className={`absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a8792f] ${listFlush ? `max-md:rounded-none md:rounded-xl${listFlushEnd ? ' max-md:rounded-b-2xl' : ''}` : 'rounded-xl'}`}
      /> : null}
      {responsiveContentColumn ? <div className="relative z-10 grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3">
        <div className="row-start-1 col-start-1">{headerHref ? <Link href={headerHref} aria-label={`Open ${lead.full_name}`} className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60">{cardAvatar}</Link> : cardAvatar}</div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              {headerHref ? <Link href={headerHref} className="group/lead-title block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60">
                <h3 className={`${responsiveContentColumn ? 'break-words [overflow-wrap:anywhere]' : 'truncate'} text-sm font-semibold leading-tight text-[color:var(--portal-text)] transition-colors group-hover/lead-title:text-[#a8792f] dark:group-hover/lead-title:text-[#dfbd68]`}>{lead.full_name}</h3>
                {subtitle ? <div className="mt-0.5 break-words text-xs text-[color:var(--portal-muted)] transition-colors group-hover/lead-title:text-[#a8792f] dark:group-hover/lead-title:text-[#dfbd68]">{subtitle}</div> : null}
              </Link> : <>
                <h3 className={`${responsiveContentColumn ? 'break-words [overflow-wrap:anywhere]' : 'truncate'} text-sm font-semibold leading-tight text-[color:var(--portal-text)]`}>{lead.full_name}</h3>
                {subtitle ? <div className="mt-0.5 break-words text-xs text-[color:var(--portal-muted)]">{subtitle}</div> : null}
              </>}
            </div>
            {(badges?.length || headerAction) ? <div className="flex max-w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end">{badges?.map((badge, index) => <PortalStatusBadge key={`${badge.label}-${index}`} status={badge.label} tone={badge.tone} warning={badge.warning} borderless />)}{headerAction}</div> : null}
          </div>
          {contact ? <div className="mt-1 break-all text-[10px] text-[color:var(--portal-muted)]">{contact}</div> : null}
        </div>
        {(children || actions) ? <div className="col-span-2 min-w-0 sm:col-start-2 sm:col-span-1">
          {children ? <div className="mt-3 space-y-2 text-sm">{children}</div> : null}
          {actions ? <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">{actions}</div> : null}
        </div> : null}
      </div> : <div className="relative z-10">
        <div className="flex min-w-0 items-start gap-3">
          {headerHref ? <Link href={headerHref} aria-label={`Open ${lead.full_name}`} className="block shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60">{cardAvatar}</Link> : cardAvatar}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                {headerHref ? <Link href={headerHref} className="group/lead-title block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60">
                  <h3 className="truncate text-sm font-semibold leading-tight text-[color:var(--portal-text)] transition-colors group-hover/lead-title:text-[#a8792f] dark:group-hover/lead-title:text-[#dfbd68]">{lead.full_name}</h3>
                  {subtitle ? <div className="mt-0.5 break-words text-xs text-[color:var(--portal-muted)] transition-colors group-hover/lead-title:text-[#a8792f] dark:group-hover/lead-title:text-[#dfbd68]">{subtitle}</div> : null}
                </Link> : <>
                  <h3 className="truncate text-sm font-semibold leading-tight text-[color:var(--portal-text)]">{lead.full_name}</h3>
                  {subtitle ? <div className="mt-0.5 break-words text-xs text-[color:var(--portal-muted)]">{subtitle}</div> : null}
                </>}
              </div>
              {(badges?.length || headerAction) ? (
                <div className="flex max-w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                  {badges?.map((badge, index) => <PortalStatusBadge key={`${badge.label}-${index}`} status={badge.label} tone={badge.tone} warning={badge.warning} borderless />)}
                  {headerAction}
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
      </div>}
    </article>
  )
}

export function LuxorCrmPrimaryAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`luxor-gold-raised inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ''}`}>{children}</button>
}

export function LuxorCrmSecondaryAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 text-xs font-semibold text-[color:var(--portal-text)] transition-all hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ''}`}>{children}</button>
}
