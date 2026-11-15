import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import { buildConversationalEmailHtml } from './luxorConversationalEmailServer'
import { luxorElenaMailFrom } from './luxorMailConfig'
import { luxorEmailHtmlToPlainText } from './luxorConversationalEmailServer'
import type { LuxorDailyPriority } from './luxorDailyPrioritiesServer'
import { formatLuxorTourDate, LUXOR_TOUR_TIMEZONE } from './luxorTourMetrics'

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
}

export type LuxorSalesBriefingTourLine = {
  id: string
  name: string
  tourDate: string
  tourTime: string | null
  href: string
}

export type LuxorSalesBriefingDepositLine = {
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

export type LuxorSalesBriefingPipeline = {
  briefingDateKey: string
  newInquiries: LuxorSalesBriefingInquiryLine[]
  openInquiriesCount: number
  openInquiryHighlights: LuxorSalesBriefingInquiryLine[]
  toursToday: LuxorSalesBriefingTourLine[]
  upcomingTours: LuxorSalesBriefingTourLine[]
  awaitingDeposit: LuxorSalesBriefingDepositLine[]
  eventsNext14Days: LuxorSalesBriefingEventLine[]
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

function emptyLine(copy: string) {
  return `<p style="margin:0 0 8px;color:#6f6456;font-size:14px;line-height:1.6;">${escapeHtml(copy)}</p>`
}

function bulletList(items: string[]) {
  if (!items.length) return emptyLine('Nothing on the board right now.')
  return `<ul style="margin:0 0 8px;padding:0 0 0 18px;color:#201b16;font-size:14px;line-height:1.65;">${items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join('')}</ul>`
}

function linkLine(label: string, href: string) {
  return `<a href="${escapeHtml(href)}" style="color:#8f6829;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>`
}

function coachingMarkdownToHtml(markdown: string) {
  const blocks = markdown.trim().split(/\n{2,}/)
  return blocks
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^[-*]\s+/m.test(trimmed)) {
        const lines = trimmed.split('\n').map((line) => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean)
        return bulletList(lines.map((line) => escapeHtml(line)))
      }
      const paragraph = escapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />')
      return `<p style="margin:0 0 12px;color:#201b16;font-size:15px;line-height:1.72;">${paragraph}</p>`
    })
    .join('')
}

function extractElenaSignatureHtml(fullHtml: string) {
  const match = fullHtml.match(/<tr>\s*<td class="luxor-signature-wrap"[\s\S]*?<\/tr>/i)
  return match?.[0] || ''
}

export function buildElenaSignatureFragment(senderPhone: string | null) {
  const full = buildConversationalEmailHtml({
    to: '',
    subject: 'Luxor sales briefing',
    body: '',
    senderName: 'Elena',
    senderRole: "Luxor's AI concierge",
    organizationName: 'Luxor at Las Palmas Events',
    senderEmail: luxorElenaMailFrom(),
    senderPhone,
    signatureWebsite: 'luxoratlaspalmas.com',
  })
  return extractElenaSignatureHtml(full)
}

function injectBeforeSystemFooter(systemHtml: string, html: string) {
  return systemHtml.replace(/<tr><td class="luxor-footer/, `${html}<tr><td class="luxor-footer`)
}

function formatChicagoBriefingTitle(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function buildLuxorSalesBriefingSubject(pipeline: Pick<LuxorSalesBriefingPipeline, 'briefingDateKey'>) {
  return `Luxor sales briefing — ${formatChicagoBriefingTitle(pipeline.briefingDateKey)}`
}

export function renderLuxorSalesBriefingEmail(input: {
  siteOrigin: string
  pipeline: LuxorSalesBriefingPipeline
  coaching?: LuxorSalesBriefingCoaching | null
  senderPhone?: string | null
}) {
  const origin = input.siteOrigin.replace(/\/$/, '')
  const portal = `${origin}/portal`
  const sections: string[] = []

  sections.push(
    `<p style="margin:0 0 18px;color:#201b16;font-size:15px;line-height:1.72;">Here's today's sales briefing from Marcus.</p>`,
  )

  if (input.coaching?.headline || input.coaching?.coachingMarkdown || input.coaching?.focusItems?.length) {
    sections.push(sectionHeading('From Marcus, Director of Growth & Sales'))
    if (input.coaching.headline) {
      sections.push(`<p style="margin:0 0 12px;color:#201b16;font-family:Cormorant Garamond,Georgia,serif;font-size:24px;line-height:1.25;">${escapeHtml(input.coaching.headline)}</p>`)
    }
    if (input.coaching.coachingMarkdown?.trim()) {
      sections.push(coachingMarkdownToHtml(input.coaching.coachingMarkdown))
    }
    if (input.coaching.focusItems?.length) {
      sections.push(
        bulletList(
          input.coaching.focusItems.map(
            (item) =>
              `<strong>${escapeHtml(item.title)}</strong>${item.detail ? ` — ${escapeHtml(item.detail)}` : ''}`,
          ),
        ),
      )
    }
  }

  sections.push(sectionHeading('New inquiries'))
  sections.push(
    bulletList(
      input.pipeline.newInquiries.map((inquiry) =>
        `${linkLine(inquiry.name, `${origin}${inquiry.href}`)} · ${escapeHtml(inquiry.eventType || 'Event')} · ${escapeHtml(inquiry.status)}`,
      ),
    ),
  )

  sections.push(sectionHeading('Open pipeline'))
  sections.push(
    `<p style="margin:0 0 8px;color:#201b16;font-size:14px;line-height:1.65;"><strong>${input.pipeline.openInquiriesCount}</strong> active lead${input.pipeline.openInquiriesCount === 1 ? '' : 's'} in the pipeline.</p>`,
  )
  if (input.pipeline.openInquiryHighlights.length) {
    sections.push(
      bulletList(
        input.pipeline.openInquiryHighlights.map(
          (inquiry) =>
            `${linkLine(inquiry.name, `${origin}${inquiry.href}`)} · ${escapeHtml(inquiry.eventType || 'Event')} · ${escapeHtml(inquiry.status)}`,
        ),
      ),
    )
  }

  sections.push(sectionHeading('Tours today'))
  sections.push(
    bulletList(
      input.pipeline.toursToday.map((tour) => {
        const when = tour.tourTime ? `${formatLuxorTourDate(tour.tourDate)} at ${tour.tourTime}` : formatLuxorTourDate(tour.tourDate)
        return `${linkLine(tour.name, `${origin}${tour.href}`)} · ${escapeHtml(when)}`
      }),
    ),
  )

  sections.push(sectionHeading('Upcoming tours'))
  sections.push(
    bulletList(
      input.pipeline.upcomingTours.map((tour) => {
        const when = tour.tourTime ? `${formatLuxorTourDate(tour.tourDate)} at ${tour.tourTime}` : formatLuxorTourDate(tour.tourDate)
        return `${linkLine(tour.name, `${origin}${tour.href}`)} · ${escapeHtml(when)}`
      }),
    ),
  )

  sections.push(sectionHeading('Awaiting booking deposit'))
  sections.push(
    bulletList(
      input.pipeline.awaitingDeposit.map(
        (row) =>
          `${linkLine(row.clientName, `${origin}${row.href}`)} · event ${escapeHtml(formatLuxorTourDate(row.eventDate))}`,
      ),
    ),
  )

  sections.push(sectionHeading('Events in the next 14 days'))
  sections.push(
    bulletList(
      input.pipeline.eventsNext14Days.map(
        (event) =>
          `${linkLine(event.clientName, `${origin}${event.href}`)} · ${escapeHtml(event.eventType || 'Event')} · ${escapeHtml(formatLuxorTourDate(event.eventDate))}`,
      ),
    ),
  )

  sections.push(sectionHeading('Saved daily priorities'))
  const openPriorities = input.pipeline.dailyPriorities.filter((priority) => !priority.completed)
  sections.push(
    bulletList(
      openPriorities.length
        ? openPriorities.map(
            (priority) =>
              `${linkLine(priority.title, `${origin}${priority.href}`)}${priority.meta ? ` · ${escapeHtml(priority.meta)}` : ''}`,
          )
        : input.pipeline.dailyPriorities.map(
            (priority) =>
              `${escapeHtml(priority.title)}${priority.completed ? ' (done)' : ''}`,
          ),
    ),
  )

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

  const signature = buildElenaSignatureFragment(input.senderPhone ?? null)
  const html = signature ? injectBeforeSystemFooter(systemHtml, signature) : systemHtml
  return {
    subject: buildLuxorSalesBriefingSubject(input.pipeline),
    html,
    text: luxorEmailHtmlToPlainText(html),
  }
}