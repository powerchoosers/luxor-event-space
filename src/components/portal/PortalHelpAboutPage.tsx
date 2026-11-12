'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Calendar,
  ExternalLink,
  HelpCircle,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Settings,
  Sparkles,
  Users,
} from '@/lib/icons/phosphor-compat'
import { PortalPageFrame, PortalPageHeader, PortalButton } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

const BOOKING_EMAIL = 'booking@luxoratlaspalmas.com'
const PUBLIC_SITE = 'https://www.luxoratlaspalmas.com'

const quickLinks = [
  {
    href: '/portal',
    label: 'Overview',
    description: 'Today’s priorities, calendar outlook, and recent activity.',
    icon: <LayoutDashboard size={16} aria-hidden="true" />,
  },
  {
    href: '/portal/leads',
    label: 'Leads & clients',
    description: 'Inquiries, follow-ups, proposals, and client dossiers.',
    icon: <Users size={16} aria-hidden="true" />,
  },
  {
    href: '/portal/calendar',
    label: 'Calendar',
    description: 'Tours, tasks, and confirmed events.',
    icon: <Calendar size={16} aria-hidden="true" />,
  },
  {
    href: '/portal/messages',
    label: 'Text messages',
    description: 'Two-way SMS with leads and clients through Luxor’s business number.',
    icon: <MessageSquare size={16} aria-hidden="true" />,
  },
  {
    href: '/portal/calls',
    label: 'Phone',
    description: 'Call history, the browser softphone, and routing.',
    icon: <Phone size={16} aria-hidden="true" />,
  },
  {
    href: '/portal/settings',
    label: 'Settings',
    description: 'Business profile, team access, Elena, integrations, and content.',
    icon: <Settings size={16} aria-hidden="true" />,
  },
] as const

function HelpSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
      <h2 className="text-base font-bold text-[color:var(--portal-text)] sm:text-lg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--portal-muted)]">{children}</div>
    </section>
  )
}

export function PortalHelpAboutPage({ buildId }: { buildId?: string }) {
  const { notify } = useToast()

  const copyBookingEmail = async () => {
    try {
      await navigator.clipboard.writeText(BOOKING_EMAIL)
      notify({ title: 'Email copied', description: `${BOOKING_EMAIL} is on your clipboard.`, variant: 'success' })
    } catch {
      notify({ title: 'Could not copy', description: 'Select the address and copy it manually.', variant: 'error' })
    }
  }

  return (
    <PortalPageFrame className="max-w-3xl pb-8">
      <PortalPageHeader
        icon={<HelpCircle size={18} />}
        title="Help & about"
        description="How the Luxor owner portal fits together, where to work day to day, and how to reach the venue when something needs a person."
      />

      <div className="mt-5 space-y-4">
        <HelpSection title="About this portal">
          <p>
            This workspace is for the Luxor at Las Palmas Events team. It keeps leads, tours, messages, calls, finances,
            and marketing tools in one signed-in place so you can respond without switching apps.
          </p>
          <p>
            Customer email and texts send through Luxor’s business mailbox and approved Twilio sender—not through a
            personal inbox. Portal login is separate from the public website.
          </p>
        </HelpSection>

        <HelpSection title="Where to start">
          <ul className="space-y-1">
            {quickLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[color:var(--portal-soft)]"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 text-[#9e7627] dark:text-[#f1d27a]">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[color:var(--portal-text)] group-hover:text-[#9e7627] dark:group-hover:text-[#f1d27a]">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[color:var(--portal-muted)]">{item.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5">Some links respect your team role. If a page is missing, ask an owner to adjust access in Settings → Team.</p>
        </HelpSection>

        <HelpSection title="Elena">
          <p className="flex items-start gap-2">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-[#caa24c]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-[color:var(--portal-text)]">Portal Elena</strong> is the assistant in the
              bottom-right of this workspace. She can read live business data and help draft messages when you are signed in.
            </span>
          </p>
          <p>
            The Elena widget on the public marketing site answers general venue and tour questions for visitors. It does not
            replace your signed-in tools here.
          </p>
        </HelpSection>

        <HelpSection title="Venue contact">
          <p>
            For event and booking questions with clients, use the lead’s Text, Call, or Email actions so the conversation stays
            in Luxor’s records.
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-3 py-2.5">
            <Mail size={16} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
            <span className="tabular-nums text-sm font-medium text-[color:var(--portal-text)]">{BOOKING_EMAIL}</span>
            <PortalButton type="button" size="sm" variant="secondary" className="ml-auto" onClick={() => void copyBookingEmail()}>
              Copy email
            </PortalButton>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`${PUBLIC_SITE}/contact`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#9e7627] no-underline transition-colors hover:text-[#724f1c] dark:text-[#f1d27a] dark:hover:text-[#fff3d4]"
            >
              Public contact page
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <a
              href={`${PUBLIC_SITE}/visit`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#9e7627] no-underline transition-colors hover:text-[#724f1c] dark:text-[#f1d27a] dark:hover:text-[#fff3d4]"
            >
              Schedule a visit
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </HelpSection>

        <HelpSection title="Policies">
          <p>Client-facing legal pages live on the public site.</p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${PUBLIC_SITE}/privacy`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--portal-text)] underline-offset-2 hover:text-[#9e7627] hover:underline dark:hover:text-[#f1d27a]"
            >
              Privacy
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <a
              href={`${PUBLIC_SITE}/terms`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--portal-text)] underline-offset-2 hover:text-[#9e7627] hover:underline dark:hover:text-[#f1d27a]"
            >
              Terms
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
          {buildId ? (
            <p className="border-t border-[color:var(--portal-border)]/70 pt-3 text-xs tabular-nums text-[color:var(--portal-faint)]">
              Portal build {buildId}
            </p>
          ) : null}
        </HelpSection>
      </div>
    </PortalPageFrame>
  )
}
