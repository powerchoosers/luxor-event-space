import { NextRequest, NextResponse } from 'next/server'
import { listTasksByInquiry, listAllTasks, createTask, updateTask } from '@/lib/luxorTasksServer'
import { getAllowedZohoPortalEmails, getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { isLuxorInquiryArchived } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (searchParams.get('all') === '1') {
      const tasks = await listAllTasks()
      return NextResponse.json({ tasks, assignees: getAllowedZohoPortalEmails() })
    }

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiryId parameter.' }, { status: 400 })
    }

    const tasks = await listTasksByInquiry(inquiryId)
    return NextResponse.json(tasks)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tasks.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { inquiryId, title, description, dueDate, dueAt, assignedTo, priority, taskType } = body

    if (typeof title !== 'string' || !title.trim() || title.trim().length > 300) {
      return NextResponse.json({ error: 'A task title of up to 300 characters is required.' }, { status: 400 })
    }
    if (description != null && (typeof description !== 'string' || description.length > 5000)) return NextResponse.json({ error: 'Task notes must be 5000 characters or fewer.' }, { status: 400 })
    if (inquiryId != null && (typeof inquiryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId))) return NextResponse.json({ error: 'Invalid lead.' }, { status: 400 })
    if (inquiryId) {
      const inquiry = await getLuxorInquiry(inquiryId)
      if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      if (isLuxorInquiryArchived(inquiry)) return NextResponse.json({ error: 'Archived leads cannot receive new follow-up tasks.' }, { status: 409 })
    }
    if (taskType != null && !['todo', 'call', 'email', 'meeting', 'other'].includes(taskType)) return NextResponse.json({ error: 'Unsupported task type.' }, { status: 400 })
    if (!inquiryId && (!taskType || !dueDate)) return NextResponse.json({ error: 'Standalone tasks need a type and due date.' }, { status: 400 })
    if (priority != null && !['low', 'medium', 'high', 'urgent'].includes(priority)) return NextResponse.json({ error: 'Unsupported task priority.' }, { status: 400 })
    if (dueDate && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(`${dueDate}T00:00:00Z`)) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate)) return NextResponse.json({ error: 'dueDate must be a valid date.' }, { status: 400 })

    if (dueAt && (typeof dueAt !== 'string' || !Number.isFinite(Date.parse(dueAt)))) {
      return NextResponse.json({ error: 'dueAt must be a valid timestamp.' }, { status: 400 })
    }
    const assignee = typeof assignedTo === 'string' && assignedTo ? assignedTo.trim().toLowerCase() : session.email
    if (!getAllowedZohoPortalEmails().includes(assignee)) return NextResponse.json({ error: 'Assignee must be an authorized portal user.' }, { status: 400 })
    const task = await createTask(inquiryId || null, title, description, dueDate, priority, { dueAt: dueAt || null, assignedTo: assignee, taskType: taskType || null })
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create task.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Task id is required.' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const key of ['status', 'completed_at', 'title', 'description', 'due_date', 'due_at', 'assigned_to', 'call_outcome', 'priority']) {
      if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key]
    }
    if (updates.status !== undefined && !['pending', 'completed', 'cancelled'].includes(String(updates.status))) {
      return NextResponse.json({ error: 'Unsupported task status.' }, { status: 400 })
    }
    if (updates.call_outcome !== undefined && ![null, 'reached', 'no_answer', 'voicemail_left'].includes(updates.call_outcome as never)) {
      return NextResponse.json({ error: 'Unsupported phone-call outcome.' }, { status: 400 })
    }
    if (updates.due_at !== undefined && updates.due_at !== null && (typeof updates.due_at !== 'string' || !Number.isFinite(Date.parse(updates.due_at)))) {
      return NextResponse.json({ error: 'due_at must be a valid timestamp.' }, { status: 400 })
    }
    if (updates.assigned_to !== undefined && updates.assigned_to !== null && (typeof updates.assigned_to !== 'string' || !getAllowedZohoPortalEmails().includes(updates.assigned_to.trim().toLowerCase()))) {
      return NextResponse.json({ error: 'Assignee must be an authorized portal user.' }, { status: 400 })
    }
    const updatedTask = await updateTask(id, updates)
    if (updatedTask?.automation_enrollment_id && updatedTask.automation_step_key && updates.status) {
      await supabaseRest(
        `luxor_follow_up_actions?enrollment_id=eq.${encodeURIComponent(updatedTask.automation_enrollment_id)}&step_key=eq.${encodeURIComponent(updatedTask.automation_step_key)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: updates.status === 'completed' ? 'completed' : 'skipped',
            outcome: updates.call_outcome ?? (updates.status === 'cancelled' ? 'skipped' : null),
            completed_at: updates.status === 'completed' ? updates.completed_at ?? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }),
        },
      )
    }
    return NextResponse.json(updatedTask)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update task.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
