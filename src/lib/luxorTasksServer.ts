import 'server-only'

import { LuxorTask, LuxorTaskPriority, LuxorTaskStatus } from './luxorInquiryTypes'

type SupabaseError = {
  message?: string
  error?: string
  details?: string
  hint?: string
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SupabaseError
    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  return (await response.json()) as T
}

export async function listTasksByInquiry(inquiryId: string) {
  return supabaseRest<LuxorTask[]>(
    `luxor_tasks?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`
  )
}

export async function createTask(
  inquiryId: string,
  title: string,
  description?: string,
  dueDate?: string,
  priority: LuxorTaskPriority = 'medium'
) {
  if (!title.trim()) {
    throw new Error('Task title cannot be empty.')
  }

  const [created] = await supabaseRest<LuxorTask[]>('luxor_tasks?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: inquiryId,
      title: title.trim(),
      description: description?.trim() || null,
      due_date: dueDate || null,
      priority,
      status: 'pending',
    }),
  })

  return created
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<LuxorTask, 'status' | 'completed_at' | 'title' | 'description' | 'due_date' | 'priority'>>
) {
  const [updated] = await supabaseRest<LuxorTask[]>(`luxor_tasks?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  })

  return updated ?? null
}

export async function listAllTasks() {
  return supabaseRest<LuxorTask[]>('luxor_tasks?select=*')
}
