import 'server-only'

import { luxorTodayKey } from './luxorTourMetrics'
import { listAllLuxorInquiries } from './luxorInquiriesServer'
import { listAllTasks } from './luxorTasksServer'
import { listLuxorBookings } from './luxorBookingsServer'
import { listAllBills } from './luxorInvoicesServer'
import { isLuxorNonRevenueTestInquiry } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

export type LuxorDailyPriority = {
  id: string
  priority_date: string
  rank: number
  title: string
  meta: string
  action_type: string
  reasoning: string
  href: string
  is_overdue: boolean
  completed: boolean
  completed_at: string | null
  target_id: string | null
  target_type: string | null
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export async function listLuxorDailyPriorities(dateStr?: string): Promise<LuxorDailyPriority[]> {
  const targetDate = dateStr || luxorTodayKey()
  try {
    const existing = await supabaseRest<LuxorDailyPriority[]>(
      `luxor_daily_priorities?priority_date=eq.${targetDate}&order=rank.asc`
    )
    if (existing && existing.length > 0) {
      // If the existing items are old generic/bounce items, regenerate them cleanly
      const isOutdated = existing.some((p) => p.title.toLowerCase().includes('bounce'))
      if (!isOutdated) {
        return existing
      }
    }
  } catch (error) {
    console.error('Failed to query luxor_daily_priorities:', error)
  }

  // If not found or outdated bounce list, generate fresh intelligent priorities
  return generateAndSaveLuxorDailyPriorities(targetDate, true)
}

export async function toggleLuxorDailyPriority(id: string, completed: boolean): Promise<LuxorDailyPriority> {
  const nowIso = new Date().toISOString()
  const payload = {
    completed,
    completed_at: completed ? nowIso : null,
    updated_at: nowIso,
  }

  const updated = await supabaseRest<LuxorDailyPriority[]>(
    `luxor_daily_priorities?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    }
  )

  if (!updated || updated.length === 0) {
    throw new Error('Priority not found or could not be updated.')
  }

  return updated[0]
}

export async function generateAndSaveLuxorDailyPriorities(
  dateStr?: string,
  force = false
): Promise<LuxorDailyPriority[]> {
  const targetDate = dateStr || luxorTodayKey()

  if (!force) {
    try {
      const existing = await supabaseRest<LuxorDailyPriority[]>(
        `luxor_daily_priorities?priority_date=eq.${targetDate}&order=rank.asc`
      )
      if (existing && existing.length > 0 && !existing.some((p) => p.title.toLowerCase().includes('bounce'))) {
        return existing
      }
    } catch {
      // Continue to generation
    }
  }

  // 1. Gather all live data from Supabase
  const [allLeads, allTasks, allBookings, allBills] = await Promise.all([
    listAllLuxorInquiries().catch(() => []),
    listAllTasks().catch(() => []),
    listLuxorBookings().catch(() => []),
    listAllBills().catch(() => []),
  ])

  const businessLeads = allLeads.filter((l) => !isLuxorNonRevenueTestInquiry(l))
  const testInquiryIds = new Set(allLeads.filter(isLuxorNonRevenueTestInquiry).map((l) => l.id))
  
  // Exclude test tasks AND exclude repetitive bounce email tasks completely
  const businessTasks = allTasks.filter(
    (t) =>
      (!t.inquiry_id || !testInquiryIds.has(t.inquiry_id)) &&
      !t.title.toLowerCase().includes('bounce')
  )

  // 2. Identify key operational segments
  // A. Tours scheduled for today
  const toursToday = businessLeads.filter(
    (l) =>
      l.preferred_tour_date === targetDate &&
      !['attended', 'no_show', 'cancelled'].includes(l.tour_attendance_status || '')
  )

  // B. Meaningful pending/overdue phone calls and follow-ups
  const pendingCallsAndFollowUps = businessTasks
    .filter((t) => t.status === 'pending' && t.due_date && t.due_date <= targetDate)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

  // C. New inquiries from last 48 hours
  const newInquiries = businessLeads
    .filter((l) => l.status === 'new' && l.created_at)
    .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
    .slice(0, 5)

  // D. Confirmed bookings with events coming up soon
  const upcomingBookings = allBookings
    .filter((b) => {
      if (!b.event_date) return false
      return b.event_date >= targetDate && (b.status === 'confirmed' || b.contract_status === 'signed')
    })
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))

  // E. Recent signed bookings
  const recentSignedBookings = allBookings
    .filter((b) => b.contract_status === 'signed')
    .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
    .slice(0, 3)

  // F. Bills due
  const billsDueSoon = allBills.filter((b) => {
    if (b.status === 'paid' || !b.due_date) return false
    return b.due_date <= targetDate
  })

  // 3. Intelligent fallback generator with natural one-liner sentences
  const fallbackPriorities: Array<{
    rank: number
    title: string
    meta: string
    action_type: string
    reasoning: string
    href: string
    is_overdue: boolean
    target_id: string | null
    target_type: string | null
  }> = []

  // Check tours today
  if (toursToday.length > 0) {
    const tour = toursToday[0]
    const timeStr = tour.preferred_tour_time ? ` at ${tour.preferred_tour_time}` : ''
    fallbackPriorities.push({
      rank: 1,
      title: toursToday.length === 1
        ? `Host ${tour.full_name} for their scheduled venue tour${timeStr}.`
        : `Prepare the ballroom and lounge to host ${toursToday.length} scheduled tours today.`,
      meta: toursToday[0]?.preferred_tour_time || 'Today',
      action_type: 'tour',
      reasoning: 'In-person venue tours have the highest conversion rate to signed bookings.',
      href: '/portal/calendar',
      is_overdue: false,
      target_id: tour.id,
      target_type: 'lead',
    })
  }

  // Check priority client calls & follow-ups (e.g. Victoria Cardenas, Rebecca Aleman)
  for (const t of pendingCallsAndFollowUps) {
    if (fallbackPriorities.length >= 5) break
    const contact = t.inquiry_id ? businessLeads.find((lead) => lead.id === t.inquiry_id) : null
    const isOverdue = Boolean(t.due_date && t.due_date < targetDate)
    const clientName = contact?.full_name || 'the client'

    let sentence = `Follow up with ${clientName} on their upcoming event plans.`
    if (t.title.toLowerCase().includes('final personal check-in') || t.title.toLowerCase().includes('phone call #4')) {
      sentence = `Call ${clientName} for her final personal check-in before the event.`
    } else if (t.title.toLowerCase().includes('phone call')) {
      sentence = `Call ${clientName} to answer event questions and review open timing.`
    } else if (t.title.toLowerCase().includes('post-tour')) {
      sentence = `Send post-tour follow-up and custom proposal recap to ${clientName}.`
    }

    fallbackPriorities.push({
      rank: fallbackPriorities.length + 1,
      title: sentence,
      meta: isOverdue ? 'Overdue' : 'Due today',
      action_type: 'task',
      reasoning: isOverdue
        ? 'Client check-in is past due and needs attention to keep event planning on track.'
        : 'Scheduled CRM workflow touchpoint due today.',
      href: t.inquiry_id ? `/portal/leads/${t.inquiry_id}?tab=tasks` : '/portal/leads',
      is_overdue: isOverdue,
      target_id: t.id,
      target_type: 'task',
    })
  }

  // Check recent signed bookings needing next steps
  if (fallbackPriorities.length < 5 && recentSignedBookings.length > 0) {
    const booking = recentSignedBookings[0]
    fallbackPriorities.push({
      rank: fallbackPriorities.length + 1,
      title: `Send welcome packet and planning checklist to ${booking.client_name} for their confirmed ${booking.event_type || 'event'}.`,
      meta: 'Confirmed',
      action_type: 'booking',
      reasoning: 'Proactive onboarding for newly signed bookings builds confidence and secures timeline details.',
      href: booking.inquiry_id ? `/portal/leads/${booking.inquiry_id}` : '/portal/calendar',
      is_overdue: false,
      target_id: booking.id,
      target_type: 'booking',
    })
  }

  // Check new inquiries needing rapid outreach
  if (fallbackPriorities.length < 5 && newInquiries.length > 0) {
    const lead = newInquiries[0]
    fallbackPriorities.push({
      rank: fallbackPriorities.length + 1,
      title: `Contact new inquiry ${lead.full_name} to answer questions and schedule a venue tour.`,
      meta: 'New lead',
      action_type: 'lead',
      reasoning: 'Reaching new inquiries within hours dramatically increases consultation booking rates.',
      href: `/portal/leads/${lead.id}`,
      is_overdue: false,
      target_id: lead.id,
      target_type: 'lead',
    })
  }

  // Check upcoming event prep
  if (fallbackPriorities.length < 5 && upcomingBookings.length > 0) {
    const nextEvent = upcomingBookings[0]
    fallbackPriorities.push({
      rank: fallbackPriorities.length + 1,
      title: `Confirm vendor arrivals and layout readiness for ${nextEvent.client_name}'s ${nextEvent.event_type || 'event'}.`,
      meta: nextEvent.event_date || 'Upcoming',
      action_type: 'booking',
      reasoning: 'Ensures venue staffing, catering access, and lighting presets are locked in.',
      href: nextEvent.inquiry_id ? `/portal/leads/${nextEvent.inquiry_id}` : '/portal/calendar',
      is_overdue: false,
      target_id: nextEvent.id,
      target_type: 'booking',
    })
  }

  // Check bills due
  if (fallbackPriorities.length < 5 && billsDueSoon.length > 0) {
    const bill = billsDueSoon[0]
    const isOverdue = Boolean(bill.due_date && bill.due_date < targetDate)
    fallbackPriorities.push({
      rank: fallbackPriorities.length + 1,
      title: `Review and process the scheduled vendor invoice for ${bill.service}.`,
      meta: isOverdue ? 'Overdue' : 'Due today',
      action_type: 'bill',
      reasoning: 'Keep vendor accounts current for smooth day-of operations.',
      href: '/portal/invoices',
      is_overdue: isOverdue,
      target_id: bill.id,
      target_type: 'bill',
    })
  }

  // Fill up to 5 with actionable steps
  while (fallbackPriorities.length < 5) {
    const rank = fallbackPriorities.length + 1
    fallbackPriorities.push({
      rank,
      title: 'Review pipeline quotes and follow up with active event prospects.',
      meta: 'Action item',
      action_type: 'review',
      reasoning: 'Keep open proposals moving forward to booking agreements.',
      href: '/portal/leads',
      is_overdue: false,
      target_id: null,
      target_type: null,
    })
  }

  // 4. AI Synthesis via OpenRouter
  let selectedPriorities = fallbackPriorities
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (apiKey) {
    try {
      const summaryContext = {
        date: targetDate,
        toursToday: toursToday.map((t) => ({
          client: t.full_name,
          time: t.preferred_tour_time,
          eventType: t.event_type,
          leadId: t.id,
        })),
        pendingTasks: pendingCallsAndFollowUps.slice(0, 8).map((t) => {
          const lead = t.inquiry_id ? businessLeads.find((l) => l.id === t.inquiry_id) : null
          return {
            taskId: t.id,
            title: t.title,
            dueDate: t.due_date,
            isOverdue: Boolean(t.due_date && t.due_date < targetDate),
            clientName: lead?.full_name,
            inquiryId: t.inquiry_id,
          }
        }),
        recentSignedBookings: recentSignedBookings.map((b) => ({
          id: b.id,
          client: b.client_name,
          eventType: b.event_type,
          eventDate: b.event_date,
          inquiryId: b.inquiry_id,
        })),
        upcomingEvents: upcomingBookings.slice(0, 3).map((b) => ({
          id: b.id,
          client: b.client_name,
          eventType: b.event_type,
          eventDate: b.event_date,
          inquiryId: b.inquiry_id,
        })),
        newInquiries: newInquiries.map((l) => ({
          id: l.id,
          name: l.full_name,
          eventType: l.event_type,
          guestCount: l.guest_count,
        })),
        billsDue: billsDueSoon.slice(0, 2).map((b) => ({
          id: b.id,
          service: b.service,
          dueDate: b.due_date,
        })),
      }

      const prompt = `You are the executive AI operations manager for Luxor Event Space (a luxury ballroom and lounge in San Antonio).
Today is ${targetDate}.
Analyze our real venue operations across tours, client phone calls, recent bookings, upcoming events, and new inquiries.
Select exactly 5 high-priority, high-impact action items for the owner and venue team today.

MANDATORY FORMATTING REQUIREMENTS:
- Every "title" MUST be written as a clear, polished, complete one-liner sentence ending with a period.
- Start each sentence with an active verb (e.g. "Call...", "Send...", "Host...", "Confirm...", "Follow up with...").
- Do NOT use fragmented labels like "Review Bounced Email - Name" or "Phone Call #4 - Final Check-In • Name".
- Do NOT include repetitive bounced email reviews. Focus on real client interactions, phone calls, tours, proposals, and signed bookings.
- Provide a concise 1-2 word badge for "meta" (e.g., "Due today", "Overdue", "2:00 PM", "Confirmed").
- Set "href" to the direct action link in the portal (e.g. "/portal/leads/{inquiryId}?tab=tasks", "/portal/calendar", or "/portal/leads/{inquiryId}").
- Return exactly 5 items ordered by rank 1 to 5.

OPERATIONAL SNAPSHOT:
${JSON.stringify(summaryContext, null, 2)}

Return ONLY valid JSON matching:
{
  "priorities": [
    {
      "rank": 1,
      "title": "Call Victoria Cardenas for her final personal check-in before her event.",
      "meta": "Due today",
      "action_type": "call",
      "reasoning": "Her check-in call is scheduled for today to finalize arrival times and setup.",
      "href": "/portal/leads/...",
      "is_overdue": false,
      "target_id": "...",
      "target_type": "task"
    }
  ]
}`

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
          'X-Title': 'Luxor Daily Priorities AI',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(18_000),
      })

      if (response.ok) {
        const json = await response.json()
        const rawContent = json?.choices?.[0]?.message?.content
        if (rawContent) {
          const parsed = JSON.parse(rawContent)
          if (Array.isArray(parsed?.priorities) && parsed.priorities.length === 5) {
            type GeneratedItem = {
              title?: string
              meta?: string
              action_type?: string
              reasoning?: string
              href?: string
              is_overdue?: boolean
              target_id?: string | null
              target_type?: string | null
            }
            selectedPriorities = (parsed.priorities as GeneratedItem[]).map((item, idx: number) => ({
              rank: idx + 1,
              title: String(item.title || fallbackPriorities[idx].title),
              meta: String(item.meta || fallbackPriorities[idx].meta),
              action_type: String(item.action_type || fallbackPriorities[idx].action_type),
              reasoning: String(item.reasoning || fallbackPriorities[idx].reasoning),
              href: String(item.href || fallbackPriorities[idx].href),
              is_overdue: Boolean(item.is_overdue),
              target_id: item.target_id ? String(item.target_id) : fallbackPriorities[idx].target_id,
              target_type: item.target_type ? String(item.target_type) : fallbackPriorities[idx].target_type,
            }))
          }
        }
      }
    } catch (aiErr) {
      console.warn('AI priorities generation fallback used:', aiErr)
    }
  }

  // 5. Persist to Supabase
  const rowsToInsert = selectedPriorities.map((p) => ({
    priority_date: targetDate,
    rank: p.rank,
    title: p.title,
    meta: p.meta,
    action_type: p.action_type,
    reasoning: p.reasoning,
    href: p.href,
    is_overdue: p.is_overdue,
    completed: false,
    target_id: p.target_id,
    target_type: p.target_type,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  try {
    // Delete existing rows for this date to ensure fresh replacement
    await supabaseRest(
      `luxor_daily_priorities?priority_date=eq.${targetDate}`,
      { method: 'DELETE' }
    ).catch(() => {})

    const inserted = await supabaseRest<LuxorDailyPriority[]>(
      'luxor_daily_priorities',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(rowsToInsert),
      }
    )

    if (inserted && inserted.length > 0) {
      return inserted.sort((a, b) => a.rank - b.rank)
    }
  } catch (dbErr) {
    console.error('Failed to save luxor_daily_priorities to database:', dbErr)
  }

  return selectedPriorities.map((p, idx) => ({
    id: `local-${targetDate}-${idx + 1}`,
    priority_date: targetDate,
    rank: p.rank,
    title: p.title,
    meta: p.meta,
    action_type: p.action_type,
    reasoning: p.reasoning,
    href: p.href,
    is_overdue: p.is_overdue,
    completed: false,
    completed_at: null,
    target_id: p.target_id,
    target_type: p.target_type,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}
