import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import {
  type CustomWorkflowDefinition,
  type CustomWorkflowTrigger,
  CUSTOM_WORKFLOW_TRIGGERS,
  validateCustomWorkflowDefinition,
} from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

const ARCHITECT_SYSTEM_PROMPT = `You are Elena, the internal executive architect for Luxor Event Space (a luxury private event and wedding venue in Mission, Texas, owned by Arianna Patterson).

Your mission is to architect complete, highly professional, custom automated marketing and sales workflows based on Arianna's natural language brief.

A valid Luxor workflow definition consists of:
- schemaVersion: 1
- trigger: one of "contact_form_inquiry_created", "sms_opt_in", "tour_upcoming", "tour_scheduled", "tour_attended", "tour_no_show", "manual"
- steps: an array of 2 to 10 steps, ending with exactly one { id: "finished", type: "end", name: "End workflow" }

Step Types allowed:
1. Call Task:
   {
     id: "step-call-1",
     type: "call_task",
     name: "Talking points / purpose of call",
     scriptNotes: "Concise talking points for Arianna, can use {{first_name}}, {{event_type}}, {{target_date}}, {{guest_count}}",
     dueWithinHours: 2, // 1 to 48
     priority: "high", // "low", "medium", "high", "urgent"
     assignee: "Arianna Patterson"
   }

2. Email:
   {
     id: "step-email-1",
     type: "email",
     mode: "marketing",
     name: "Step name",
     subject: "Catchy, warm subject line (can use {{first_name}}, {{event_type}})",
     previewText: "Short preview snippet",
     body: "Warm, luxurious body text with paragraphs and dynamic variables",
     ctaText: "Schedule a Tour", // or "View Packages", "View Gallery", "Review Proposal"
     ctaUrl: "https://www.luxoratlaspalmas.com/tour", // must be on luxoratlaspalmas.com
     generationMode: "manual" // or "ai" with "aiPrompt"
   }

3. Text (SMS):
   {
     id: "step-text-1",
     type: "text",
     name: "Step name",
     body: "Luxor Events: Hi {{first_name}}! Message copy here... Reply STOP to opt out.",
     requiredConsentScope: "marketing",
     generationMode: "manual"
   }
   NOTE: Luxor text messages MUST start with "Luxor Events: " or "Luxor Event Space: " and MUST end with "Reply STOP to opt out." Max 480 characters.

4. Wait:
   {
     id: "step-wait-1",
     type: "wait",
     name: "Wait 2 days",
     amount: 2,
     unit: "hours" // or "minutes" or "days"
   }

5. Condition:
   {
     id: "step-cond-1",
     type: "condition",
     name: "Check eligibility",
     condition: "follow_up_eligible", // or "marketing_sms_consent", "tour_scheduled", "tour_attended"
     whenFalse: "stop"
   }

6. End:
   {
     id: "finished",
     type: "end",
     name: "End workflow"
   }

Allowed Merge Fields:
{{first_name}}, {{full_name}}, {{event_type}}, {{guest_count}}, {{target_date}}, {{tour_date}}, {{tour_time}}, {{venue_phone}}, {{venue_email}}

Return ONLY a valid JSON object with:
{
  "name": "Concise workflow name",
  "explanation": "1-2 sentences on why this workflow is structured this way",
  "definition": {
    "schemaVersion": 1,
    "trigger": "...",
    "steps": [...]
  }
}`

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = (await request.json()) as { prompt?: string }
    const userPrompt = String(payload.prompt || '').trim()

    if (!userPrompt) {
      return NextResponse.json({ error: 'Please describe the workflow you want Elena to create.' }, { status: 400 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://luxoratlaspalmas.com',
            'X-Title': 'Luxor Elena Workflow Architect',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
              { role: 'user', content: `Arianna's workflow request: "${userPrompt}"` },
            ],
          }),
          signal: AbortSignal.timeout(18_000),
        })

        if (response.ok) {
          const completion = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>
          }
          const content = completion.choices?.[0]?.message?.content
          if (content) {
            const parsed = JSON.parse(content) as {
              name?: string
              explanation?: string
              definition?: CustomWorkflowDefinition
            }
            if (parsed.definition && parsed.name) {
              const errors = validateCustomWorkflowDefinition(parsed.definition, { allowIncompleteDraft: true })
              if (errors.length === 0) {
                return NextResponse.json({
                  name: parsed.name,
                  explanation: parsed.explanation || 'Workflow architected successfully.',
                  definition: parsed.definition,
                  source: 'ai',
                })
              }
            }
          }
        }
      } catch (aiErr) {
        console.warn('AI Architect OpenRouter call failed, falling back to smart heuristic:', aiErr)
      }
    }

    // Fallback smart generator based on prompt keywords
    const fallback = generateFallbackWorkflow(userPrompt)
    return NextResponse.json({
      name: fallback.name,
      explanation: fallback.explanation,
      definition: fallback.definition,
      source: 'heuristic',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Elena could not architect the workflow.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function generateFallbackWorkflow(prompt: string): {
  name: string
  explanation: string
  definition: CustomWorkflowDefinition
} {
  const lower = prompt.toLowerCase()
  let trigger: CustomWorkflowTrigger = 'contact_form_inquiry_created'
  let name = 'Personalized Inquiry Journey'

  if (lower.includes('sms') || lower.includes('opt in') || lower.includes('text')) {
    trigger = 'sms_opt_in'
    name = 'SMS Opt-In Welcome & Priority Call'
  } else if (lower.includes('no show') || lower.includes('missed tour')) {
    trigger = 'tour_no_show'
    name = 'Tour No-Show Warm Recovery'
  } else if (lower.includes('reminder') || lower.includes('upcoming')) {
    trigger = 'tour_upcoming'
    name = '24-Hour Tour Reminder & Checklist'
  } else if (lower.includes('post tour') || lower.includes('after tour') || lower.includes('attended')) {
    trigger = 'tour_attended'
    name = 'Post-Tour Experience & Booking Follow-up'
  } else if (lower.includes('quince') || lower.includes('quinceañera')) {
    trigger = 'contact_form_inquiry_created'
    name = 'Quinceañera Dream Celebration Journey'
  } else if (lower.includes('wedding')) {
    trigger = 'contact_form_inquiry_created'
    name = 'Luxury Wedding Experience Journey'
  }

  const steps: CustomWorkflowDefinition['steps'] = [
    {
      id: 'step-email-welcome',
      type: 'email',
      mode: 'marketing',
      name: 'Initial Welcome & Gallery',
      subject: 'Welcome to Luxor Event Space, {{first_name}}!',
      previewText: 'We would love to host your upcoming {{event_type}}.',
      body: 'Dear {{first_name}},\n\nThank you for reaching out to Luxor at Las Palmas. We are delighted to assist in planning your {{event_type}} for {{guest_count}} guests.\n\nTake a virtual walkthrough of our grand ballroom and private suites.',
      ctaText: 'Explore Photo Gallery',
      ctaUrl: 'https://www.luxoratlaspalmas.com/gallery',
      generationMode: 'manual',
    },
    {
      id: 'step-wait-1',
      type: 'wait',
      name: 'Wait 2 hours',
      amount: 2,
      unit: 'hours',
    },
    {
      id: 'step-call-1',
      type: 'call_task',
      name: 'Direct outreach call',
      scriptNotes: 'Reach out to {{first_name}} regarding their {{event_type}} inquiry for {{target_date}}. Offer priority dates for an in-person tour.',
      dueWithinHours: 3,
      priority: 'high',
      assignee: 'Arianna Patterson',
    },
    {
      id: 'step-wait-2',
      type: 'wait',
      name: 'Wait 1 day',
      amount: 1,
      unit: 'days',
    },
    {
      id: 'step-cond-1',
      type: 'condition',
      name: 'Verify SMS opt-in',
      condition: 'marketing_sms_consent',
      whenFalse: 'stop',
    },
    {
      id: 'step-text-1',
      type: 'text',
      name: 'Friendly tour invitation text',
      body: 'Luxor Events: Hi {{first_name}}, Arianna checking in! Would you like to schedule a private walkthrough this week for your {{event_type}}? Reply STOP to opt out.',
      requiredConsentScope: 'marketing',
      generationMode: 'manual',
    },
    {
      id: 'finished',
      type: 'end',
      name: 'End workflow',
    },
  ]

  return {
    name,
    explanation: 'Elena crafted this balanced multi-channel sequence blending immediate digital receipts, prompt personal phone touchpoints, and polite text outreach.',
    definition: {
      schemaVersion: 1,
      trigger,
      steps,
    },
  }
}
