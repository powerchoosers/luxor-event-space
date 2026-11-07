import 'server-only'

import { LuxorTask, LuxorTaskPriority, LuxorTaskType } from './luxorInquiryTypes'

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

export async function enrichTasksWithWorkflows(tasks: LuxorTask[]): Promise<LuxorTask[]> {
  if (!tasks.length) return tasks

  const enrollmentIds = [...new Set(tasks.map((t) => t.automation_enrollment_id).filter((id): id is string => Boolean(id)))]
  const workflowNameByEnrollmentId = new Map<string, { name: string; type: 'system' | 'custom' }>()

  if (enrollmentIds.length > 0) {
    try {
      const chunks = Array.from({ length: Math.ceil(enrollmentIds.length / 100) }, (_, i) => enrollmentIds.slice(i * 100, (i + 1) * 100))
      const [enrollments, automations] = await Promise.all([
        Promise.all(chunks.map((chunk) => supabaseRest<Array<{ id: string; automation_key: string }>>(`luxor_follow_up_enrollments?select=id,automation_key&id=in.(${chunk.join(',')})`))).then((r) => r.flat()).catch(() => []),
        supabaseRest<Array<{ automation_key: string; name: string }>>('luxor_follow_up_automations?select=automation_key,name').catch(() => []),
      ])

      const autoNameByKey = new Map(automations.map((a) => [a.automation_key, a.name]))
      for (const enr of enrollments) {
        const name = autoNameByKey.get(enr.automation_key) || (enr.automation_key === 'brochure_lead' ? 'Brochure Lead Follow-Up' : enr.automation_key.replace(/_/g, ' '))
        workflowNameByEnrollmentId.set(enr.id, { name, type: 'system' })
      }

      const remainingIds = enrollmentIds.filter((id) => !workflowNameByEnrollmentId.has(id))
      if (remainingIds.length > 0) {
        const remainingChunks = Array.from({ length: Math.ceil(remainingIds.length / 100) }, (_, i) => remainingIds.slice(i * 100, (i + 1) * 100))
        const customEnrollments = await Promise.all(
          remainingChunks.map((chunk) => supabaseRest<Array<{ id: string; workflow_id: string }>>(`luxor_custom_workflow_enrollments?select=id,workflow_id&id=in.(${chunk.join(',')})`))
        ).then((r) => r.flat()).catch(() => [])

        const workflowIds = [...new Set(customEnrollments.map((ce) => ce.workflow_id))]
        if (workflowIds.length > 0) {
          const wfChunks = Array.from({ length: Math.ceil(workflowIds.length / 100) }, (_, i) => workflowIds.slice(i * 100, (i + 1) * 100))
          const workflows = await Promise.all(
            wfChunks.map((chunk) => supabaseRest<Array<{ id: string; name: string }>>(`luxor_custom_workflows?select=id,name&id=in.(${chunk.join(',')})`))
          ).then((r) => r.flat()).catch(() => [])
          const wfNameById = new Map(workflows.map((w) => [w.id, w.name]))

          for (const ce of customEnrollments) {
            const name = wfNameById.get(ce.workflow_id) || 'Custom Workflow'
            workflowNameByEnrollmentId.set(ce.id, { name, type: 'custom' })
          }
        }
      }
    } catch (err) {
      console.error('Error enriching tasks with workflows:', err)
    }
  }

  return tasks.map((task) => {
    if (task.automation_enrollment_id && workflowNameByEnrollmentId.has(task.automation_enrollment_id)) {
      const match = workflowNameByEnrollmentId.get(task.automation_enrollment_id)!
      return {
        ...task,
        workflow_name: match.name,
        workflow_type: match.type,
      }
    }

    if ((task as { post_tour_source_inquiry_id?: string | null }).post_tour_source_inquiry_id || /\[post-tour\]/i.test(task.description || '') || /post-tour/i.test(task.title)) {
      return {
        ...task,
        workflow_name: 'Post-Tour Follow-Up',
        workflow_type: 'post_tour',
      }
    }

    if (/^\[follow-up:(email|phone)\]/i.test(task.description || '') || /^follow up after call/i.test(task.title)) {
      return {
        ...task,
        workflow_name: 'Manual Follow-Up',
        workflow_type: 'manual',
      }
    }

    if (/^follow up:\s*/i.test(task.title)) {
      return {
        ...task,
        workflow_name: 'Meeting Follow-Up',
        workflow_type: 'meeting',
      }
    }

    return {
      ...task,
      workflow_name: null,
      workflow_type: null,
    }
  })
}

export async function listTasksByInquiry(inquiryId: string) {
  const tasks = await supabaseRest<LuxorTask[]>(
    `luxor_tasks?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`
  )
  return enrichTasksWithWorkflows(tasks)
}

export async function createTask(
  inquiryId: string | null,
  title: string,
  description?: string,
  dueDate?: string,
  priority: LuxorTaskPriority = 'medium',
  options: { dueAt?: string | null; assignedTo?: string | null; taskType?: LuxorTaskType | null } = {},
) {
  if (!title.trim()) {
    throw new Error('Task title cannot be empty.')
  }

  const [created] = await supabaseRest<LuxorTask[]>('luxor_tasks?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: inquiryId,
      task_type: options.taskType || null,
      title: title.trim(),
      description: description?.trim() || null,
      due_date: dueDate || null,
      due_at: options.dueAt || null,
      assigned_to: options.assignedTo || null,
      priority,
      status: 'pending',
    }),
  })

  return created
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<LuxorTask, 'status' | 'completed_at' | 'title' | 'description' | 'due_date' | 'due_at' | 'assigned_to' | 'call_outcome' | 'priority'>>
) {
  const [updated] = await supabaseRest<LuxorTask[]>(`luxor_tasks?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    // This helper is called by the authenticated task-edit API. Any owner
    // mutation takes ownership of the task instead of allowing a later tour
    // outcome replay to reactivate it as an automation-managed task.
    body: JSON.stringify(Object.keys(updates).length
      ? { ...updates, post_tour_reopen_cancelled: false, post_tour_user_modified: true }
      : updates),
  })

  return updated ?? null
}

export async function listAllTasks() {
  const tasks = await supabaseRest<LuxorTask[]>('luxor_tasks?select=*')
  return enrichTasksWithWorkflows(tasks)
}
