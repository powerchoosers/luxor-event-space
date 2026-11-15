import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import {
  buildLuxorConversationalEmailSignatureRow,
  luxorEmailHtmlToPlainText,
} from './luxorConversationalEmailServer'
import { luxorElenaMailFrom } from './luxorMailConfig'
import { luxorInquiryStatusLabel } from './luxorInquiryTypes'
import type { LuxorDailyPriority } from './luxorDailyPrioritiesServer'
import { formatLuxorTourDate } from './luxorTourMetrics'
import {
  buildLuxorSalesBriefingSubject,
  formatLuxorSalesBriefingChicagoTitle,
  sanitizeLuxorSalesBriefingCopy,
} from './luxorSalesBriefingPipelineModel'
import { coachingMarkdownToHtml } from './luxorSalesBriefingCoachingMarkdown'

export { buildLuxorSalesBriefingSubject, sanitizeLuxorSalesBriefingCopy } from './luxorSalesBriefingPipelineModel'

export type LuxorSalesBriefingFocusItem = {
  title: string
  detail: string
}

export type LuxorSalesBriefingCoaching = {
  headline?: string | null
  coachingMarkdown?: string | null
  focusItems?: LuxorSalesBriefingFocusItem[]
}

export type LuxorSalesBriefingInquiryLine = {
  id: string
  name: string
  eventType: string
  status: string
  href: string
  waitingLabel?: string | null
}

export type LuxorSalesBriefingTourLine = {
  id: string
  name: string
  tourDate: string
  tourTime: string | null
  tourStatus: string
  href: string
}

export type LuxorSalesBriefingPaymentLine = {
  id: string
  clientName: string
  eventDate: string
  href: string
}

export type LuxorSalesBriefingEventLine = {
  id: string
  clientName: string
  eventDate: string
  eventType: string
  href: string
}

export type LuxorSalesBriefingTaskLine = {
  id: string
  name: string
  detail: string
  href: string | null
}

export type LuxorSalesBriefingPipeline = {
  briefingDateKey: string
  newInquiries: LuxorSalesBriefingInquiryLine[]
  openInquiriesCount: number
  openInquiryHighlights: LuxorSalesBriefingInquiryLine[]
  leadsToCallToday: LuxorSalesBriefingTaskLine[]
  toursToday: LuxorSalesBriefingTourLine[]
  upcomingTours: LuxorSalesBriefingTourLine[]
  awaitingBookingPayment: LuxorSalesBriefingPaymentLine[]
  eventsNext14Days: LuxorSalesBriefingEventLine[]
  overdueFollowUps: LuxorSalesBriefingTaskLine[]
  tourNoShowsToRebook: LuxorSalesBriefingTourLine[]
  dailyPriorities: LuxorDailyPriority[]
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sectionHeading(label: string) {
  return `<h2 style="margin:28px 0 10px;color:#8f6829;font-family:Manrope,Helvetica Neue,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;">${escapeHtml(label)}</h2>`
}

function bulletList(items: string[]) {
  return `<ul style="margin:0 0 8px;padding:0 0 0 18px;color:#201b16;font-size:14px;line-height:1.65;">${items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join('')}</ul>`
}

function linkLine(label: string, href: string) {
  return `<a href="${escapeHtml(href)}" style="color:#8f6829;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>`
}

function addListSection(sections: string[], heading: string, lines: string[]) {
  if (!lines.length) return
  sections.push(sectionHeading(heading))
  sections.push(bulletList(lines))
}

function buildElenaSignatureRow(senderPhone: string | null) {
  return buildLuxorConversationalEmailSignatureRow(
    {
      senderName: 'Elena',
      senderRole: "Luxor's AI concierge",
      organizationName: 'Luxor at Las Palmas Events',
      senderEmail: luxorElenaMailFrom(),
      senderPhone,
      signatureWebsite: 'luxoratlaspalmas.com',
    },
    { horizontalPadPx: 42, borderColor: '#d9c7a6' },
  )
}

function injectBeforeSystemFooter(systemHtml: string, html: string) {
  return systemHtml.replace(/<tr><td class="luxor-footer/, `${html}<tr><td class="luxor-footer`)
}

const formatChicagoBriefingTitle = formatLuxorSalesBriefingChicagoTitle

function renderTourLine(origin: string, tour: LuxorSalesBriefingTourLine) {
  const when = tour.tourTime
    ? `${formatLuxorTourDate(tour.tourDate)} at ${tour.tourTime}`
    : formatLuxorTourDate(tour.tourDate)
  return `${linkLine(tour.name, `${origin}${tour.href}`)} · ${escapeHtml(tour.tourStatus)} · ${escapeHtml(when)}`
}

export function renderLuxorSalesBriefingEmail(input: {
  siteOrigin: string
  pipeline: LuxorSalesBriefingPipeline
  marcusBriefingReady?: boolean
  coaching?: LuxorSalesBriefingCoaching | null
  senderPhone?: string | null
}) {
  const origin = input.siteOrigin.replace(/\/$/, '')
  const portal = `${origin}/portal`
  const sections: string[] = []
  const marcusReady = Boolean(input.marcusBriefingReady && input.coaching)
  const intro = marcusReady
    ? "Here's today's sales briefing from Marcus."
    : "Here's your sales briefing for today."

  sections.push(
    `<p style="margin:0 0 18px;color:#201b16;font-size:15px;line-height:1.72;">${escapeHtml(intro)}</p>`,
  )

  if (marcusReady) {
    const marcusParts: string[] = [sectionHeading('From Marcus, Director of Growth & Sales')]
    if (input.coaching?.headline) {
      marcusParts.push(
        `<p style="margin:0 0 12px;color:#201b16;font-family:Cormorant Garamond,Georgia,serif;font-size:24px;line-height:1.25;">${escapeHtml(sanitizeLuxorSalesBriefingCopy(input.coaching.headline))}</p>`,
      )
    }
    if (input.coaching?.coachingMarkdown?.trim()) {
      marcusParts.push(
        coachingMarkdownToHtml(sanitizeLuxorSalesBriefingCopy(input.coaching.coachingMarkdown)),
      )
    }
    if (input.coaching?.focusItems?.length) {
      marcusParts.push(
        bulletList(
          input.coaching.focusItems.map(
            (item) =>
              `<strong>${escapeHtml(sanitizeLuxorSalesBriefingCopy(item.title))}</strong>${item.detail ? `: ${escapeHtml(sanitizeLuxorSalesBriefingCopy(item.detail))}` : ''}`,
          ),
        ),
      )
    }
    if (marcusParts.length > 1) sections.push(...marcusParts)
  }

  addListSection(
    sections,
    'Leads to call today',
    input.pipeline.leadsToCallToday.map((row) => {
      const linked = row.href ? linkLine(row.name, `${origin}${row.href}`) : escapeHtml(row.name)
      return `${linked} · ${escapeHtml(row.detail)}`
    }),
  )

  addListSection(
    sections,
    'New inquiries',
    input.pipeline.newInquiries.map((inquiry) => {
      const waiting = inquiry.waitingLabel ? ` · ${escapeHtml(inquiry.waitingLabel)}` : ''
      return `${linkLine(inquiry.name, `${origin}${inquiry.href}`)} · ${escapeHtml(inquiry.eventType || 'Event')} · ${escapeHtml(luxorInquiryStatusLabel(inquiry.status))}${waiting}`
    }),
  )

  if (input.pipeline.openInquiriesCount > 0) {
    sections.push(sectionHeading('Open pipeline'))
    sections.push(
      `<p style="margin:0 0 8px;color:#201b16;font-size:14px;line-height:1.65;"><strong>${input.pipeline.openInquiriesCount}</strong> active lead${input.pipeline.openInquiriesCount === 1 ? '' : 's'} in the pipeline.</p>`,
    )
    if (input.pipeline.openInquiryHighlights.length) {
      sections.push(
        bulletList(
          input.pipeline.openInquiryHighlights.map(
            (inquiry) =>
              `${linkLine(inquiry.name, `${origin}${inquiry.href}`)} · ${escapeHtml(inquiry.eventType || 'Event')} · ${escapeHtml(luxorInquiryStatusLabel(inquiry.status))}`,
          ),
        ),
      )
    }
  }

  addListSection(
    sections,
    'Tours today',
    input.pipeline.toursToday.map((tour) => renderTourLine(origin, tour)),
  )
  addListSection(
    sections,
    'Upcoming tours',
    input.pipeline.upcomingTours.map((tour) => renderTourLine(origin, tour)),
  )
  addListSection(
    sections,
    'Awaiting booking payment',
    input.pipeline.awaitingBookingPayment.map(
      (row) =>
        `${linkLine(row.clientName, `${origin}${row.href}`)} · event ${escapeHtml(formatLuxorTourDate(row.eventDate))}`,
    ),
  )
  addListSection(
    sections,
    'Events in the next 14 days',
    input.pipeline.eventsNext14Days.map(
      (event) =>
        `${linkLine(event.clientName, `${origin}${event.href}`)} · ${escapeHtml(event.eventType || 'Event')} · ${escapeHtml(formatLuxorTourDate(event.eventDate))}`,
    ),
  )
  addListSection(
    sections,
    'Overdue follow-ups',
    input.pipeline.overdueFollowUps.map((row) => {
      const linked = row.href ? linkLine(row.name, `${origin}${row.href}`) : escapeHtml(row.name)
      return `${linked} · ${escapeHtml(row.detail)}`
    }),
  )
  addListSection(
    sections,
    'Tour no-shows to rebook',
    input.pipeline.tourNoShowsToRebook.map((tour) => renderTourLine(origin, tour)),
  )

  const openPriorities = input.pipeline.dailyPriorities.filter((priority) => !priority.completed)
  const priorityLines = openPriorities.length
    ? openPriorities.map(
        (priority) =>
          `${linkLine(priority.title, `${origin}${priority.href}`)}${priority.meta ? ` · ${escapeHtml(priority.meta)}` : ''}`,
      )
    : input.pipeline.dailyPriorities.map(
        (priority) => `${escapeHtml(priority.title)}${priority.completed ? ' (done)' : ''}`,
      )
  addListSection(sections, 'Saved daily priorities', priorityLines)

  const title = 'Your morning sales briefing'
  const eyebrow = 'Daily sales briefing'
  const greeting = 'Good morning, Arianna.'
  const systemHtml = renderLuxorSystemEmail({
    previewText: `${eyebrow} for ${formatChicagoBriefingTitle(input.pipeline.briefingDateKey)}`,
    eyebrow,
    title,
    greeting,
    bodyHtml: sections.join(''),
    actions: [{ label: 'Open portal', url: portal }],
    note: 'This briefing is read-only. Reply on the booking inbox if you want the team to action anything here.',
    theme: 'brand',
  })

  const signature = buildElenaSignatureRow(input.senderPhone ?? null)
  const html = signature ? injectBeforeSystemFooter(systemHtml, signature) : systemHtml
  return {
    subject: buildLuxorSalesBriefingSubject({
      briefingDateKey: input.pipeline.briefingDateKey,
      marcusBriefingReady: input.marcusBriefingReady,
      headline: input.coaching?.headline,
    }),
    html,
    text: luxorEmailHtmlToPlainText(html),
  }
}