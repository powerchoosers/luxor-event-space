import {
  isLuxorBounceForCurrentAddress,
  isSameLuxorBounceTaskEvent,
  normalizeLuxorEmailAddress,
  resolveLuxorBounceRecipients,
} from './luxorEmailBounce'

type BounceInquiry = {
  id: string
  full_name: string
  email: string | null
  metadata: Record<string, unknown> | null
}

type BounceJob = { inquiry_id: string | null; recipient_email: string }
type BounceTask = { id: string; inquiry_id: string; description: string | null }
type BounceSupabaseRest = <T>(path: string, init?: RequestInit) => Promise<T>

export type BounceMailRow = {
  metadata?: Record<string, unknown> | null
  to_addresses?: string[] | null
}

export type BounceWebhookEvent = {
  created_at: string
  data: {
    email_id?: string
    to?: string[]
    bounce?: { type?: string; subType?: string; message?: string }
  }
}

function shouldReplaceBounceFlag(inquiry: BounceInquiry, bouncedAddress: string, occurredAt: string) {
  const existing = inquiry.metadata?.emailBounce
  if (!existing || typeof existing !== 'object') return true
  const previous = existing as Record<string, unknown>
  const previousAddress = normalizeLuxorEmailAddress(previous.address)
  if (!previousAddress) return true
  const previousIsCurrent = isLuxorBounceForCurrentAddress(inquiry.email, previousAddress)
  const candidateIsCurrent = isLuxorBounceForCurrentAddress(inquiry.email, bouncedAddress)
  if (previousIsCurrent !== candidateIsCurrent) return candidateIsCurrent
  const previousAt = Date.parse(String(previous.occurredAt || ''))
  const candidateAt = Date.parse(occurredAt)
  return !Number.isFinite(previousAt) || candidateAt >= previousAt
}

export async function handleLuxorResendBounce(
  row: BounceMailRow,
  event: BounceWebhookEvent,
  eventId: string,
  dependencies: {
    supabaseRest: BounceSupabaseRest
    broadcast: (eventName: string, payload: Record<string, string>) => Promise<unknown>
  },
) {
  const emailJobId = row.metadata?.emailJobId
  const hasEmailJobId = typeof emailJobId === 'string' && /^[0-9a-f-]{36}$/i.test(emailJobId)
  const jobs = hasEmailJobId
    ? await dependencies.supabaseRest<BounceJob[]>(
      `luxor_email_jobs?select=inquiry_id,recipient_email&id=eq.${encodeURIComponent(emailJobId as string)}&limit=1`,
    )
    : []
  const job = jobs[0]
  const bouncedAddresses = resolveLuxorBounceRecipients({
    linkedJobRecipient: job?.recipient_email,
    providerRecipients: event.data.to,
    mailboxRecipients: row.to_addresses,
  })
  if (!bouncedAddresses.length) return

  const bounce = event.data.bounce
  const bounceKind = String(bounce?.type || '').trim().toLowerCase()
  const bounceReason = String(bounce?.message || bounce?.subType || '').trim().slice(0, 500)
  const occurredAt = new Date(event.created_at).toISOString()
  const taskTitle = 'Review bounced email address'
  const flaggedInquiryIds = new Set<string>()

  for (const bouncedAddress of bouncedAddresses) {
    const emailMatches = await dependencies.supabaseRest<BounceInquiry[]>(
      `luxor_inquiries?select=id,full_name,email,metadata&email=ilike.${encodeURIComponent(bouncedAddress)}&order=created_at.asc&limit=100`,
    )
    const exactEmailMatches = emailMatches.filter((item) => normalizeLuxorEmailAddress(item.email) === bouncedAddress)
    const priorEventMatches = await dependencies.supabaseRest<BounceInquiry[]>(
      `luxor_inquiries?select=id,full_name,email,metadata&metadata->emailBounce->>providerEventId=eq.${encodeURIComponent(eventId)}&metadata->emailBounce->>address=eq.${encodeURIComponent(bouncedAddress)}&limit=100`,
    )
    const linkedInquiry = job?.inquiry_id
      ? await dependencies.supabaseRest<BounceInquiry[]>(
        `luxor_inquiries?select=id,full_name,email,metadata&id=eq.${encodeURIComponent(job.inquiry_id)}&limit=1`,
      )
      : []
    const matches = [...new Map(
      [...priorEventMatches, ...linkedInquiry, ...exactEmailMatches].map((inquiry) => [inquiry.id, inquiry]),
    ).values()]
    if (!matches.length) continue

    const issue = {
      address: bouncedAddress,
      occurredAt,
      providerEventId: eventId,
      providerEmailId: event.data.email_id || null,
      type: bounceKind || 'bounce',
      reason: bounceReason || 'The email provider could not deliver this message.',
    }
    for (const inquiry of matches) {
      const currentAddress = isLuxorBounceForCurrentAddress(inquiry.email, bouncedAddress)
      if (shouldReplaceBounceFlag(inquiry, bouncedAddress, occurredAt)) {
        await dependencies.supabaseRest<unknown>(`luxor_inquiries?id=eq.${encodeURIComponent(inquiry.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ metadata: { ...(inquiry.metadata || {}), emailBounce: { ...issue, currentAddress, currentAddressAtReport: currentAddress } } }),
        })
      }
      flaggedInquiryIds.add(inquiry.id)
    }

    // Search all records for this exact email/event pair. A retry can discover
    // the same duplicate leads in a different order after some writes succeed.
    const isCurrentAddress = isLuxorBounceForCurrentAddress(matches[0].email, bouncedAddress)
    const taskDescription = [
      `Email could not be delivered to ${bouncedAddress}.`,
      isCurrentAddress
        ? 'Please confirm the correct email address with the lead before sending another email.'
        : 'This was an earlier address. Check it against the current contact details before taking action.',
      `Provider event: ${eventId}`,
      `Bounced recipient: ${bouncedAddress}`,
      `Reported: ${occurredAt}`,
      `Reason: ${issue.reason}`,
    ].join('\n')
    const inquiryIds = matches.map((inquiry) => inquiry.id).join(',')
    const matchingTasks = await dependencies.supabaseRest<BounceTask[]>(
      `luxor_tasks?select=id,inquiry_id,description&inquiry_id=in.(${inquiryIds})&title=eq.${encodeURIComponent(taskTitle)}&order=created_at.asc&limit=200`,
    )
    const existingTask = matchingTasks.find((task) => isSameLuxorBounceTaskEvent(task.description, eventId, bouncedAddress))
    if (existingTask) {
      await dependencies.supabaseRest<unknown>(`luxor_tasks?id=eq.${encodeURIComponent(existingTask.id)}`, {
        method: 'PATCH', body: JSON.stringify({ description: taskDescription }),
      })
    } else {
      const primaryInquiry = matches[0]
      await dependencies.supabaseRest<unknown>('luxor_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ inquiry_id: primaryInquiry.id, title: taskTitle, description: taskDescription,
          due_at: occurredAt, due_date: occurredAt.slice(0, 10), priority: 'high', status: 'pending' }),
      })
    }
    await dependencies.broadcast('lead-email-bounced', { eventId, inquiryId: matches[0].id })
  }

  return [...flaggedInquiryIds]
}
