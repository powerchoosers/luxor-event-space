import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

type InquiryRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  preferred_tour_date: string | null
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = (await request.json()) as {
      workflowId: string
      inquiryIds: string[]
    }

    const { workflowId, inquiryIds } = payload
    if (!workflowId) {
      return NextResponse.json({ error: 'Please select a workflow to enroll in.' }, { status: 400 })
    }
    if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
      return NextResponse.json({ error: 'Please select at least one lead to enroll.' }, { status: 400 })
    }

    // Resolve workflow definition & name
    let workflowName = 'Custom Workflow'
    let definition: CustomWorkflowDefinition | null = null

    const prebuilt = PREBUILT_WORKFLOWS.find((p) => p.id === workflowId)
    if (prebuilt) {
      workflowName = prebuilt.name
      definition = prebuilt.definition
    } else {
      const [customWf] = await supabaseRest<Array<{ name: string; draft_definition: CustomWorkflowDefinition }>>(
        `luxor_custom_workflows?select=name,draft_definition&id=eq.${encodeURIComponent(workflowId)}&limit=1`,
      )
      if (customWf) {
        workflowName = customWf.name
        definition = customWf.draft_definition
      }
    }

    if (!definition) {
      return NextResponse.json({ error: 'Workflow definition could not be located.' }, { status: 404 })
    }

    // Load inquiries
    const idsQuery = inquiryIds.map((id) => `id=eq.${encodeURIComponent(id)}`).join(',')
    const inquiries = await supabaseRest<InquiryRow[]>(
      `luxor_inquiries?select=id,full_name,email,phone,event_type,target_date,guest_count,preferred_tour_date&or=(${idsQuery})`,
    )

    let tasksCreated = 0

    // For each inquiry, process immediate enrollment actions
    for (const inquiry of inquiries) {
      const firstName = (inquiry.full_name || '').split(' ')[0] || 'there'
      const eventType = inquiry.event_type || 'event'
      const targetDate = inquiry.target_date || 'TBD'
      const guestCount = inquiry.guest_count ? `${inquiry.guest_count} guests` : 'TBD'
      const tourDate = inquiry.preferred_tour_date || 'TBD'

      // Check for call_task steps
      for (const step of definition.steps) {
        if (step.type === 'call_task') {
          // Resolve merge tokens in script
          let notes = step.scriptNotes || ''
          notes = notes
            .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
            .replace(/\{\{\s*full_name\s*\}\}/g, inquiry.full_name || 'Client')
            .replace(/\{\{\s*event_type\s*\}\}/g, eventType)
            .replace(/\{\{\s*target_date\s*\}\}/g, targetDate)
            .replace(/\{\{\s*guest_count\s*\}\}/g, guestCount)
            .replace(/\{\{\s*tour_date\s*\}\}/g, tourDate)

          const dueHours = Number(step.dueWithinHours) || 4
          const dueDate = new Date(Date.now() + dueHours * 3600 * 1000).toISOString()

          await supabaseRest('luxor_tasks', {
            method: 'POST',
            body: JSON.stringify({
              inquiry_id: inquiry.id,
              title: `${step.name}: ${inquiry.full_name || 'Lead'}`,
              description: notes,
              priority: step.priority || 'medium',
              assigned_to: step.assignee || 'Arianna Patterson',
              due_at: dueDate,
              status: 'pending',
            }),
          })
          tasksCreated++
        }
      }

      // Add a note to the lead's history
      await supabaseRest('luxor_notes', {
        method: 'POST',
        body: JSON.stringify({
          inquiry_id: inquiry.id,
          author: 'Workflow Engine',
          content: `Enrolled in workflow: "${workflowName}".`,
          note_type: 'automation',
        }),
      }).catch((err) => console.warn('Could not record enrollment note:', err))
    }

    return NextResponse.json({
      success: true,
      workflowName,
      enrolledCount: inquiries.length,
      tasksCreated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not enroll leads in workflow.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
