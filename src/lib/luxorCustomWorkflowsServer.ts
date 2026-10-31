import 'server-only'

import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import { supabaseRest } from './supabaseRestServer'
import { getAllowedZohoPortalEmails, isAuthorizedLuxorPortalEmail } from './luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from './luxorPortalAccess'
import {
  cloneCustomWorkflowDefinition,
  createNewContactFollowUpDefinition,
  type CustomWorkflowDefinition,
  type CustomWorkflowStep,
  validateCustomWorkflowDefinition,
} from './luxorCustomWorkflowDefinition'
import {
  CUSTOM_WORKFLOW_AUTHORING_ENABLED,
  CUSTOM_WORKFLOW_EXECUTION_ENABLED,
} from './luxorCustomWorkflowFeatureGates'
import { evaluateCustomWorkflowLifecycleAction, type CustomWorkflowLifecycleAction } from './luxorCustomWorkflowLifecycle'

export { CUSTOM_WORKFLOW_AUTHORING_ENABLED, CUSTOM_WORKFLOW_EXECUTION_ENABLED }

export type CustomWorkflowRow = {
  id: string
  name: string
  trigger_type: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  draft_definition: CustomWorkflowDefinition
  draft_revision: number
  current_version_id: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type CustomWorkflowActivityRow = {
  id: string
  event_type: string
  actor_email: string | null
  details: Record<string, unknown>
  created_at: string
}

export type CustomWorkflowLifecycleCapabilities = {
  canPause: boolean
  canResume: boolean
  canArchive: boolean
  canActivate: boolean
  activationMessage: string
}

export type CustomWorkflowFeatureStatus = {
  authoringEnabled: boolean
  executionEnabled: boolean
  activationEnabled: boolean
}

export class CustomWorkflowServiceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function requireCustomWorkflowAuthoring() {
  if (!CUSTOM_WORKFLOW_AUTHORING_ENABLED) {
    throw new CustomWorkflowServiceError('Custom workflow authoring is disabled by its release control.', 503)
  }
}

async function getCustomWorkflowRuntimeControls() {
  const [controls] = await supabaseRest<Array<{ authoring_enabled: boolean; execution_enabled: boolean; activation_enabled: boolean }>>(
    'luxor_custom_workflow_runtime_controls?select=authoring_enabled,execution_enabled,activation_enabled&singleton=eq.true&limit=1',
  )
  return controls
}

export async function getCustomWorkflowFeatureStatus(actorEmail: string): Promise<CustomWorkflowFeatureStatus> {
  await requireCustomWorkflowOperator(actorEmail)
  const controls = await getCustomWorkflowRuntimeControls()
  const authoringEnabled = CUSTOM_WORKFLOW_AUTHORING_ENABLED && controls?.authoring_enabled === true
  const executionEnabled = CUSTOM_WORKFLOW_EXECUTION_ENABLED && controls?.execution_enabled === true
  return {
    authoringEnabled,
    executionEnabled,
    activationEnabled: authoringEnabled && executionEnabled && controls?.activation_enabled === true,
  }
}

async function requireCustomWorkflowAuthoringControl() {
  requireCustomWorkflowAuthoring()
  const controls = await getCustomWorkflowRuntimeControls()
  if (controls?.authoring_enabled !== true) {
    throw new CustomWorkflowServiceError('Custom workflow authoring is disabled by its runtime control.', 503)
  }
}

/**
 * API routes pass only the email from getLuxorPortalSession(). This additional
 * check enforces both the existing approved-operator list and the member's
 * existing marketing permission before custom-workflow data or mutations.
 */
export async function requireCustomWorkflowOperator(actorEmail: string) {
  const normalizedEmail = String(actorEmail || '').trim().toLowerCase()
  if (!normalizedEmail || !isAuthorizedLuxorPortalEmail(normalizedEmail)) {
    throw new CustomWorkflowServiceError('Approved operator access is required for custom workflows.', 403)
  }
  const member = await getLuxorPortalMember(normalizedEmail)
  if (!member || member.status !== 'active' || !memberCan(member, 'marketing')) {
    throw new CustomWorkflowServiceError('Marketing permission is required for custom workflows.', 403)
  }
  return normalizedEmail
}

export async function listCustomWorkflows(actorEmail: string) {
  await requireCustomWorkflowOperator(actorEmail)
  requireCustomWorkflowAuthoring()
  return supabaseRest<CustomWorkflowRow[]>(
    'luxor_custom_workflows?select=id,name,trigger_type,status,draft_definition,draft_revision,created_at,updated_at,archived_at&order=updated_at.desc',
  )
}

export async function getCustomWorkflow(id: string, actorEmail: string) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(actorEmail)
  requireCustomWorkflowAuthoring()
  assertId(id)
  const [workflow] = await supabaseRest<CustomWorkflowRow[]>(
    `luxor_custom_workflows?select=id,name,trigger_type,status,draft_definition,draft_revision,current_version_id,created_at,updated_at,archived_at&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  if (!workflow) throw new CustomWorkflowServiceError('Custom workflow not found.', 404)
  let detailDefinition = workflow.draft_definition
  if (workflow.current_version_id) {
    const [version] = await supabaseRest<Array<{ id: string; definition: CustomWorkflowDefinition }>>(
      `luxor_custom_workflow_versions?select=id,definition&id=eq.${encodeURIComponent(workflow.current_version_id)}&workflow_id=eq.${encodeURIComponent(workflow.id)}&limit=1`,
    )
    if (!version) throw new CustomWorkflowServiceError('The immutable current workflow version could not be loaded.', 409)
    detailDefinition = version.definition
  }
  const activity = await supabaseRest<CustomWorkflowActivityRow[]>(
    `luxor_custom_workflow_activity?select=id,event_type,actor_email,details,created_at&workflow_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=50`,
  )
  const capabilities = await getCustomWorkflowLifecycleCapabilities(workflow.status, verifiedActorEmail)
  return { workflow, definition: detailDefinition, activity, capabilities }
}

export async function getCustomWorkflowLifecycleCapabilities(status: CustomWorkflowRow['status'], actorEmail: string): Promise<CustomWorkflowLifecycleCapabilities> {
  const verifiedActorEmail = await requireCustomWorkflowOperator(actorEmail)
  requireCustomWorkflowAuthoring()
  const controls = await getCustomWorkflowRuntimeControls()
  const common = {
    actorEmail: verifiedActorEmail,
    authorizedOperatorEmails: getAllowedZohoPortalEmails(),
    status,
    authoringEnabled: CUSTOM_WORKFLOW_AUTHORING_ENABLED && controls?.authoring_enabled === true,
    executionEnabled: CUSTOM_WORKFLOW_EXECUTION_ENABLED && controls?.execution_enabled === true,
    activationEnabled: controls?.activation_enabled === true,
  }
  return {
    canPause: evaluateCustomWorkflowLifecycleAction({ ...common, action: 'pause' }).allowed,
    canResume: evaluateCustomWorkflowLifecycleAction({ ...common, action: 'resume' }).allowed,
    canArchive: evaluateCustomWorkflowLifecycleAction({ ...common, action: 'archive' }).allowed,
    canActivate: evaluateCustomWorkflowLifecycleAction({ ...common, action: 'activate' }).allowed,
    activationMessage: 'Activate only after the workflow content and timing have owner approval. Activation enrolls only new eligible inquiries.',
  }
}

export async function changeCustomWorkflowLifecycle(input: {
  id: string
  action: CustomWorkflowLifecycleAction
  actorEmail: string
}) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(input.actorEmail)
  await requireCustomWorkflowAuthoringControl()
  assertId(input.id)
  const controls = await getCustomWorkflowRuntimeControls()
  const decision = evaluateCustomWorkflowLifecycleAction({
    actorEmail: verifiedActorEmail,
    authorizedOperatorEmails: getAllowedZohoPortalEmails(),
    status: 'draft',
    action: input.action,
    authoringEnabled: CUSTOM_WORKFLOW_AUTHORING_ENABLED && controls?.authoring_enabled === true,
    executionEnabled: CUSTOM_WORKFLOW_EXECUTION_ENABLED && controls?.execution_enabled === true,
    activationEnabled: controls?.activation_enabled === true,
  })
  // State-specific transitions are also enforced atomically in the database.
  // The actor is taken only from the verified portal session, never the body.
  if (!decision.allowed && decision.status !== 409) {
    throw new CustomWorkflowServiceError(decision.message, decision.status)
  }
  let rows: CustomWorkflowRow[]
  try {
    rows = await supabaseRest<CustomWorkflowRow[]>('rpc/luxor_custom_workflow_change_lifecycle', {
      method: 'POST',
      body: JSON.stringify({ p_workflow_id: input.id, p_action: input.action, p_actor_email: verifiedActorEmail }),
    })
  } catch (error) {
    if (error instanceof Error && /only an inactive workflow|only an active workflow|only a previously activated|complete inactive draft/i.test(error.message)) {
      throw new CustomWorkflowServiceError(error.message, 409)
    }
    if (error instanceof Error && /activation|lifecycle is disabled/i.test(error.message)) {
      throw new CustomWorkflowServiceError(error.message, 503)
    }
    throw error
  }
  const workflow = rows[0]
  if (!workflow) throw new CustomWorkflowServiceError('Workflow lifecycle could not be verified. Reload before continuing.', 409)
  return workflow
}

export async function createCustomWorkflow(input: { name: unknown; definition?: unknown; actorEmail: string }) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(input.actorEmail)
  await requireCustomWorkflowAuthoringControl()
  const name = normalizeName(input.name)
  const definition = input.definition === undefined ? createNewContactFollowUpDefinition() : cloneAndValidateDraft(input.definition)
  const [workflow] = await supabaseRest<CustomWorkflowRow[]>('rpc/luxor_custom_workflow_create_draft', {
    method: 'POST',
    body: JSON.stringify({ p_name: name, p_definition: definition, p_actor_email: verifiedActorEmail }),
  })
  if (!workflow) throw new Error('The custom workflow draft was not saved.')
  return workflow
}

export async function saveCustomWorkflowDraft(input: {
  id: string
  name: unknown
  definition: unknown
  expectedRevision: unknown
  actorEmail: string
}) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(input.actorEmail)
  await requireCustomWorkflowAuthoringControl()
  assertId(input.id)
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    throw new CustomWorkflowServiceError('The saved draft changed. Reload it before saving again.', 409)
  }
  const name = normalizeName(input.name)
  const definition = cloneAndValidateDraft(input.definition)
  let rows: CustomWorkflowRow[]
  try {
    rows = await supabaseRest<CustomWorkflowRow[]>('rpc/luxor_custom_workflow_save_draft', {
      method: 'POST',
      body: JSON.stringify({
        p_workflow_id: input.id,
        p_expected_revision: Number(input.expectedRevision),
        p_name: name,
        p_definition: definition,
        p_actor_email: verifiedActorEmail,
      }),
    })
  } catch (error) {
    if (error instanceof Error && /revision changed|no longer editable/i.test(error.message)) {
      throw new CustomWorkflowServiceError('The saved draft changed or is no longer editable. Reload before saving.', 409)
    }
    throw error
  }
  const workflow = rows[0]
  if (!workflow) throw new CustomWorkflowServiceError('The saved draft could not be verified. Reload before saving.', 409)
  return workflow
}

export async function duplicateCustomWorkflow(id: string, actorEmail: string) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(actorEmail)
  const { workflow, definition } = await getCustomWorkflow(id, verifiedActorEmail)
  return createCustomWorkflow({ name: `${workflow.name} copy`, definition, actorEmail: verifiedActorEmail })
}

export async function archiveCustomWorkflowDraft(id: string, actorEmail: string) {
  const verifiedActorEmail = await requireCustomWorkflowOperator(actorEmail)
  await requireCustomWorkflowAuthoringControl()
  assertId(id)
  let rows: CustomWorkflowRow[]
  try {
    rows = await supabaseRest<CustomWorkflowRow[]>('rpc/luxor_custom_workflow_archive_draft', {
      method: 'POST',
      body: JSON.stringify({ p_workflow_id: id, p_actor_email: verifiedActorEmail }),
    })
  } catch (error) {
    if (error instanceof Error && /only an inactive draft/i.test(error.message)) {
      throw new CustomWorkflowServiceError('Only an inactive draft can be archived here.', 409)
    }
    throw error
  }
  const workflow = rows[0]
  if (!workflow) throw new CustomWorkflowServiceError('Only an inactive draft can be archived here.', 409)
  return workflow
}

export function previewCustomWorkflowEmail(step: CustomWorkflowStep) {
  if (step.type !== 'email' || step.mode !== 'marketing') throw new CustomWorkflowServiceError('Choose an editable email step to preview.')
  const errors = validateCustomWorkflowDefinition({
    schemaVersion: 1,
    trigger: 'contact_form_inquiry_created',
    steps: [step, { id: 'preview-end', type: 'end', name: 'End preview' }],
  }).filter((error) => !['steps.0.id', 'steps.0.name'].includes(error.path))
  if (errors.length) throw new CustomWorkflowServiceError(errors[0].message)

  const renderedBody = replaceMergeFields(step.body)
    .split(/\r?\n/)
    .map((line) => line.trim() ? `<p style="margin:0 0 14px;white-space:pre-line">${escapeHtml(line)}</p>` : '')
    .join('')
  const unsubscribe = '<p style="margin:22px 0 0;font-size:12px;color:#6f6456">Unsubscribe link is inserted for each eligible recipient before delivery.</p>'
  return renderLuxorSystemEmail({
    previewText: replaceMergeFields(step.previewText),
    eyebrow: 'Message from Luxor',
    title: replaceMergeFields(step.subject),
    greeting: 'Hi Sample,',
    bodyHtml: renderedBody + unsubscribe,
    actions: step.ctaText && step.ctaUrl ? [{ label: step.ctaText, url: step.ctaUrl, tone: 'primary' }] : [],
    theme: 'light',
  })
}

function cloneAndValidateDraft(input: unknown) {
  const errors = validateDraftShape(input)
  if (errors.length) throw new CustomWorkflowServiceError(errors[0].message)
  const contentErrors = validateCustomWorkflowDefinition(input, { allowIncompleteDraft: true })
  if (contentErrors.length) throw new CustomWorkflowServiceError(contentErrors[0].message)
  return JSON.parse(JSON.stringify(input)) as CustomWorkflowDefinition
}

function validateDraftShape(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [{ message: 'Workflow definition must be an object.' }]
  const value = input as Partial<CustomWorkflowDefinition>
  if (value.schemaVersion !== 1 || value.trigger !== 'contact_form_inquiry_created' || !Array.isArray(value.steps)) {
    return [{ message: 'Only the verified new contact-form inquiry trigger is supported.' }]
  }
  if (value.steps.length < 2 || value.steps.length > 20) return [{ message: 'Add between 2 and 20 workflow steps.' }]
  const ids = new Set<string>()
  const invalid = value.steps.find((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(step.id) || ids.has(step.id)) return true
    ids.add(step.id)
    if (typeof step.name !== 'string' || !step.name.trim() || step.name.length > 120) return true
    if (step.type === 'email') return !['existing_inquiry_acknowledgment', 'marketing'].includes(step.mode)
      || typeof step.subject !== 'string' || step.subject.length > 500
      || typeof step.previewText !== 'string' || step.previewText.length > 500
      || typeof step.body !== 'string' || step.body.length > 12_000
      || typeof step.ctaText !== 'string' || typeof step.ctaUrl !== 'string'
      || (step.mode === 'existing_inquiry_acknowledgment' && index !== 0)
      || (step.mode === 'existing_inquiry_acknowledgment' && (step.name !== 'Existing inquiry acknowledgment'
        || step.subject !== 'We have received your Luxor inquiry'
        || step.previewText !== 'We received your Luxor inquiry and will connect with you shortly.'
        || step.body !== '' || step.ctaText !== '' || step.ctaUrl !== ''))
    if (step.type === 'text') return step.requiredConsentScope !== 'marketing' || typeof step.body !== 'string' || step.body.length > 480
    if (step.type === 'call_task') return typeof step.scriptNotes !== 'string'
      || typeof step.dueWithinHours !== 'number' || step.dueWithinHours < 1 || step.dueWithinHours > 168
      || !['low', 'medium', 'high', 'urgent'].includes(step.priority)
      || (step.assignee !== undefined && typeof step.assignee !== 'string')
    if (step.type === 'wait') return !['minutes', 'hours', 'days'].includes(step.unit) || (step.amount !== null && (!Number.isInteger(step.amount) || step.amount < 0 || step.amount > 365))
    if (step.type === 'condition') return !['follow_up_eligible', 'marketing_email_consent', 'marketing_sms_consent'].includes(step.condition) || step.whenFalse !== 'stop'
    return step.type !== 'end'
  })
  if (invalid) return [{ message: 'The workflow contains an unsupported or malformed step.' }]
  const steps = value.steps as CustomWorkflowStep[]
  if (steps[0]?.type !== 'email' || steps[0].mode !== 'existing_inquiry_acknowledgment') {
    return [{ message: 'The existing contact acknowledgment must remain the first workflow step so the flow cannot send a duplicate receipt.' }]
  }
  if (steps.filter((step) => step.type === 'end').length !== 1 || steps.at(-1)?.type !== 'end') {
    return [{ message: 'A workflow needs exactly one end step, at the end.' }]
  }
  if (steps.some((step, index) => step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' && index !== 0)) {
    return [{ message: 'The existing contact acknowledgment must remain first.' }]
  }
  return []
}

function normalizeName(value: unknown) {
  if (typeof value !== 'string') throw new CustomWorkflowServiceError('Enter a workflow name.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 120) throw new CustomWorkflowServiceError('Workflow name must be 1 to 120 characters.')
  return name
}

function assertId(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new CustomWorkflowServiceError('Invalid custom workflow id.', 400)
}

function replaceMergeFields(value: string) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, field: string) => {
    const samples: Record<string, string> = {
      first_name: 'Sample',
      full_name: 'Sample Guest',
      event_type: 'Private celebration',
      guest_count: '80',
      target_date: 'To be determined',
    }
    return samples[field] || ''
  })
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
