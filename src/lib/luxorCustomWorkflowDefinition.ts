export const CUSTOM_WORKFLOW_TRIGGER = 'contact_form_inquiry_created' as const

export const CUSTOM_WORKFLOW_TRIGGERS = [
  'contact_form_inquiry_created',
  'sms_opt_in',
  'tour_upcoming',
  'tour_scheduled',
  'tour_attended',
  'tour_no_show',
  'manual',
] as const

export type CustomWorkflowTrigger = (typeof CUSTOM_WORKFLOW_TRIGGERS)[number]

export const CUSTOM_WORKFLOW_TRIGGER_LABELS: Record<CustomWorkflowTrigger, { label: string; description: string }> = {
  contact_form_inquiry_created: {
    label: 'Contact form inquiry',
    description: 'Triggers when a prospect submits an inquiry via the website contact form.',
  },
  sms_opt_in: {
    label: 'SMS opt-in confirmed',
    description: 'Triggers when a client opts in to receive text messages from Luxor.',
  },
  tour_upcoming: {
    label: 'Tour upcoming (24h reminder)',
    description: 'Triggers 24 hours prior to a scheduled venue tour visit.',
  },
  tour_scheduled: {
    label: 'Tour scheduled',
    description: 'Triggers immediately when a prospect books a tour date and time.',
  },
  tour_attended: {
    label: 'Tour attended / completed',
    description: 'Triggers when Arianna or staff marks a tour visit completed.',
  },
  tour_no_show: {
    label: 'Tour no-show',
    description: 'Triggers when a client misses their scheduled tour appointment.',
  },
  manual: {
    label: 'Manual enrollment',
    description: 'Enrolled manually via the lead dossier 3-dot menu or bulk table action.',
  },
}

export type CustomWorkflowStatus = 'draft' | 'active' | 'paused' | 'archived'
export type CustomWorkflowChannel = 'email' | 'text' | 'call_task' | 'wait' | 'condition' | 'end'

export type CustomWorkflowEmailStep = {
  id: string
  type: 'email'
  mode: 'existing_inquiry_acknowledgment' | 'marketing'
  name: string
  subject: string
  previewText: string
  body: string
  ctaText: string
  ctaUrl: string
  generationMode?: 'manual' | 'ai'
  aiPrompt?: string
  templateId?: string
}

export type CustomWorkflowTextStep = {
  id: string
  type: 'text'
  name: string
  body: string
  requiredConsentScope: 'marketing'
  generationMode?: 'manual' | 'ai'
  aiPrompt?: string
}

export type CustomWorkflowCallTaskStep = {
  id: string
  type: 'call_task'
  name: string
  scriptNotes: string
  dueWithinHours: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee?: string
}

export type CustomWorkflowWaitStep = {
  id: string
  type: 'wait'
  name: string
  amount: number | null
  unit: 'minutes' | 'hours' | 'days'
}

export type CustomWorkflowConditionStep = {
  id: string
  type: 'condition'
  name: string
  condition: 'follow_up_eligible' | 'marketing_email_consent' | 'marketing_sms_consent' | 'tour_scheduled' | 'tour_attended' | 'unresponsive'
  whenFalse: 'stop'
}

export type CustomWorkflowEndStep = {
  id: string
  type: 'end'
  name: string
}

export type CustomWorkflowStep =
  | CustomWorkflowEmailStep
  | CustomWorkflowTextStep
  | CustomWorkflowCallTaskStep
  | CustomWorkflowWaitStep
  | CustomWorkflowConditionStep
  | CustomWorkflowEndStep

export type CustomWorkflowDefinition = {
  schemaVersion: 1
  trigger: CustomWorkflowTrigger
  steps: CustomWorkflowStep[]
}

export type CustomWorkflowDefinitionError = {
  path: string
  message: string
}

export const CUSTOM_WORKFLOW_ALLOWED_MERGE_FIELDS = [
  'first_name',
  'full_name',
  'event_type',
  'guest_count',
  'target_date',
  'tour_date',
  'tour_time',
  'venue_phone',
  'venue_email',
] as const

export type CustomWorkflowMergeField = (typeof CUSTOM_WORKFLOW_ALLOWED_MERGE_FIELDS)[number]

export const DYNAMIC_VARIABLE_CHIPS: Array<{
  label: string
  token: string
  preview: string
  category: 'lead' | 'event' | 'tour' | 'venue'
}> = [
  { label: 'First Name', token: '{{first_name}}', preview: 'Sarah', category: 'lead' },
  { label: 'Full Name', token: '{{full_name}}', preview: 'Sarah Jenkins', category: 'lead' },
  { label: 'Event Type', token: '{{event_type}}', preview: 'Wedding Reception', category: 'event' },
  { label: 'Event Date', token: '{{target_date}}', preview: 'October 24, 2026', category: 'event' },
  { label: 'Guest Count', token: '{{guest_count}}', preview: '150 guests', category: 'event' },
  { label: 'Tour Date', token: '{{tour_date}}', preview: 'Saturday, Nov 7', category: 'tour' },
  { label: 'Tour Time', token: '{{tour_time}}', preview: '2:00 PM', category: 'tour' },
  { label: 'Venue Phone', token: '{{venue_phone}}', preview: '(956) 555-0199', category: 'venue' },
  { label: 'Venue Email', token: '{{venue_email}}', preview: 'hello@luxoratlaspalmas.com', category: 'venue' },
]

const MAX_STEPS = 25
const MAX_BODY_LENGTH = 12_000
export const CUSTOM_WORKFLOW_TEXT_MAX_LENGTH = 480
const MAX_WAIT_AMOUNT = 365
const CANONICAL_LUXOR_ORIGIN = 'https://www.luxoratlaspalmas.com'

export const CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND = 'Luxor Events'
export const CUSTOM_WORKFLOW_TEXT_OPT_OUT_FOOTER = 'Reply STOP to opt out.'

const LUXOR_TEXT_BRANDS = [
  'Luxor Event Space',
  'Luxor Events',
  'Luxor at Las Palmas Events',
  'Luxor at Las Palmas',
] as const
const LUXOR_TEXT_BRAND_PREFIX = /^(Luxor at Las Palmas Events|Luxor at Las Palmas|Luxor Event Space|Luxor Events)\b\s*:?\s*/i
const LUXOR_TEXT_STOP_FOOTER = /\s*(?:(?:reply|text|send)\s+)?stop(?:\s+to\s+(?:opt[\s-]?out|unsubscribe|stop|end|cancel|quit)|\s+for\s+(?:help|assistance))?[.!?]*\s*$/i

function splitCustomWorkflowText(value: string) {
  let content = value
  let brand: string | null = null
  let brandMatch = LUXOR_TEXT_BRAND_PREFIX.exec(content)
  while (brandMatch) {
    brand ||= LUXOR_TEXT_BRANDS.find((candidate) => candidate.toLowerCase() === brandMatch?.[1]?.toLowerCase()) || null
    content = content.slice(brandMatch[0].length)
    brandMatch = LUXOR_TEXT_BRAND_PREFIX.exec(content)
  }
  while (content) {
    const contentWithoutFooter = content.replace(LUXOR_TEXT_STOP_FOOTER, '').trim()
    if (contentWithoutFooter === content) break
    content = contentWithoutFooter
  }
  content = content.trim()
  return { brand, content }
}

export function getCustomWorkflowTextEditorContent(value: string) {
  return splitCustomWorkflowText(value).content
}

export function getCustomWorkflowTextBrand(value: string) {
  return splitCustomWorkflowText(value).brand || CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND
}

export function composeCustomWorkflowText(value: string, preferredBrand = CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND) {
  const parts = splitCustomWorkflowText(value)
  const requestedBrand = LUXOR_TEXT_BRANDS.find((candidate) => candidate.toLowerCase() === preferredBrand.trim().toLowerCase())
  const brand = parts.brand || requestedBrand || CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND
  if (!parts.content) return ''
  return `${brand}: ${parts.content} ${CUSTOM_WORKFLOW_TEXT_OPT_OUT_FOOTER}`
}

export function getCustomWorkflowTextEditorMaxLength(brand = CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND) {
  const approvedBrand = LUXOR_TEXT_BRANDS.find((candidate) => candidate.toLowerCase() === brand.trim().toLowerCase())
    || CUSTOM_WORKFLOW_TEXT_DEFAULT_BRAND
  return Math.max(0, CUSTOM_WORKFLOW_TEXT_MAX_LENGTH - `${approvedBrand}:`.length - CUSTOM_WORKFLOW_TEXT_OPT_OUT_FOOTER.length - 2)
}

export function createNewContactFollowUpDefinition(): CustomWorkflowDefinition {
  return {
    schemaVersion: 1,
    trigger: CUSTOM_WORKFLOW_TRIGGER,
    steps: [
      {
        id: 'inquiry-acknowledgment',
        type: 'email',
        mode: 'existing_inquiry_acknowledgment',
        name: 'Existing inquiry acknowledgment',
        subject: 'We have received your Luxor inquiry',
        previewText: 'We received your Luxor inquiry and will connect with you shortly.',
        body: '',
        ctaText: '',
        ctaUrl: '',
      },
      { id: 'follow-up-wait', type: 'wait', name: 'Wait before follow-up', amount: 2, unit: 'hours' },
      { id: 'operator-call-task', type: 'call_task', name: 'Speed to lead phone call', scriptNotes: 'Call {{first_name}} to confirm date availability for their {{event_type}} with {{guest_count}}.', dueWithinHours: 3, priority: 'high', assignee: 'Arianna Patterson' },
      { id: 'eligibility-check', type: 'condition', name: 'Check that follow-up is still appropriate', condition: 'follow_up_eligible', whenFalse: 'stop' },
      { id: 'marketing-text', type: 'text', name: 'Personalized follow-up text', body: 'Luxor Events: Hi {{first_name}}, Arianna here from Luxor! We would love to show you the venue for your {{event_type}}. Do you have time this week for a quick tour? Reply STOP to opt out.', requiredConsentScope: 'marketing', generationMode: 'manual' },
      { id: 'finished', type: 'end', name: 'End follow-up' },
    ],
  }
}

export function cloneCustomWorkflowDefinition(definition: CustomWorkflowDefinition): CustomWorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as CustomWorkflowDefinition
}

export function validateCustomWorkflowDefinition(
  input: unknown,
  options: { allowIncompleteDraft?: boolean } = {},
): CustomWorkflowDefinitionError[] {
  const allowIncompleteDraft = options.allowIncompleteDraft === true
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [{ path: 'definition', message: 'Workflow definition must be an object.' }]
  }

  const definition = input as Partial<CustomWorkflowDefinition>
  const errors: CustomWorkflowDefinitionError[] = []
  rejectUnexpectedKeys(definition, ['schemaVersion', 'trigger', 'steps', 'metadata'], 'definition', errors)
  if (definition.schemaVersion !== 1) errors.push({ path: 'schemaVersion', message: 'This workflow version is not supported.' })
  if (!definition.trigger || !CUSTOM_WORKFLOW_TRIGGERS.includes(definition.trigger)) {
    errors.push({ path: 'trigger', message: 'Choose a supported workflow trigger.' })
  }
  if (!Array.isArray(definition.steps) || definition.steps.length < 2 || definition.steps.length > MAX_STEPS) {
    errors.push({ path: 'steps', message: `Add between 2 and ${MAX_STEPS} steps.` })
    return errors
  }

  const ids = new Set<string>()
  for (const [index, step] of definition.steps.entries()) {
    const path = `steps.${index}`
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      errors.push({ path, message: 'Step is invalid.' })
      continue
    }
    const allowedStepKeys = step.type === 'email'
      ? ['id', 'type', 'mode', 'name', 'subject', 'previewText', 'body', 'ctaText', 'ctaUrl', 'generationMode', 'aiPrompt', 'templateId']
      : step.type === 'text'
        ? ['id', 'type', 'name', 'body', 'requiredConsentScope', 'generationMode', 'aiPrompt']
        : step.type === 'call_task'
          ? ['id', 'type', 'name', 'scriptNotes', 'dueWithinHours', 'priority', 'assignee']
          : step.type === 'wait'
            ? ['id', 'type', 'name', 'amount', 'unit']
            : step.type === 'condition'
              ? ['id', 'type', 'name', 'condition', 'whenFalse']
              : step.type === 'end'
                ? ['id', 'type', 'name']
                : ['id', 'type', 'name']
    rejectUnexpectedKeys(step, allowedStepKeys, path, errors)
    if (typeof step.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(step.id)) errors.push({ path: `${path}.id`, message: 'Step identifiers may use letters, numbers, underscores, and hyphens.' })
    if (typeof step.name !== 'string') {
      errors.push({ path: `${path}.name`, message: 'Enter a step name of 1 to 120 characters.' })
      continue
    }
    if (ids.has(step.id)) errors.push({ path: `${path}.id`, message: 'Step identifiers must be unique.' })
    ids.add(step.id)
    if (!step.name.trim() || step.name.length > 120) errors.push({ path: `${path}.name`, message: 'Enter a step name of 1 to 120 characters.' })

    if (step.type === 'email') {
      if (step.mode && step.mode !== 'existing_inquiry_acknowledgment' && step.mode !== 'marketing') {
        errors.push({ path: `${path}.mode`, message: 'This email delivery type is unsupported.' })
      }
      if (typeof step.subject !== 'string' || typeof step.previewText !== 'string' || typeof step.body !== 'string' || typeof step.ctaText !== 'string' || typeof step.ctaUrl !== 'string') {
        errors.push({ path, message: 'Email content fields must be text.' })
        continue
      }
      if (step.mode === 'existing_inquiry_acknowledgment' && index !== 0) {
        errors.push({ path, message: 'The existing contact acknowledgment can only be the first step.' })
      }
      if (step.mode === 'existing_inquiry_acknowledgment'
        && (step.name !== 'Existing inquiry acknowledgment'
          || step.subject !== 'We have received your Luxor inquiry'
          || step.previewText !== 'We received your Luxor inquiry and will connect with you shortly.'
          || step.body !== '' || step.ctaText !== '' || step.ctaUrl !== '')) {
        errors.push({ path, message: 'The existing contact acknowledgment is a read-only marker; its content remains managed by the existing inquiry path.' })
      }
      const isAi = step.generationMode === 'ai'
      if (isAi) {
        if (!allowIncompleteDraft && (!step.aiPrompt || !step.aiPrompt.trim())) {
          errors.push({ path: `${path}.aiPrompt`, message: 'Describe the email instructions for Elena AI.' })
        }
      } else if (step.mode !== 'existing_inquiry_acknowledgment') {
        if (step.subject.length > 500 || (!allowIncompleteDraft && !step.subject.trim()) || /[\r\n]/.test(step.subject)) errors.push({ path: `${path}.subject`, message: 'Enter a one-line subject of 1 to 500 characters.' })
        if (step.previewText.length > 500) errors.push({ path: `${path}.previewText`, message: 'Preview text is too long.' })
        if (step.body.length > MAX_BODY_LENGTH || (!allowIncompleteDraft && !step.body.trim())) errors.push({ path: `${path}.body`, message: `Email body must be 1 to ${MAX_BODY_LENGTH} characters.` })
        validateMergeFields(step.subject, `${path}.subject`, errors)
        validateMergeFields(step.previewText, `${path}.previewText`, errors)
        validateMergeFields(step.body, `${path}.body`, errors)
        validateMergeFields(step.ctaText, `${path}.ctaText`, errors)
        validateLuxorLink(step.ctaUrl, `${path}.ctaUrl`, errors)
        if (Boolean(step.ctaText.trim()) !== Boolean(step.ctaUrl.trim())) errors.push({ path: `${path}.ctaUrl`, message: 'The button needs both a label and a destination, or neither.' })
      }
    } else if (step.type === 'text') {
      if (step.requiredConsentScope !== 'marketing') errors.push({ path: `${path}.requiredConsentScope`, message: 'Automated workflow texts require marketing consent.' })
      const isAi = step.generationMode === 'ai'
      if (isAi) {
        if (!allowIncompleteDraft && (!step.aiPrompt || !step.aiPrompt.trim())) {
          errors.push({ path: `${path}.aiPrompt`, message: 'Describe the SMS prompt for Elena AI.' })
        }
      } else {
        if (typeof step.body !== 'string') errors.push({ path: `${path}.body`, message: 'Text content must be text.' })
        else {
          if (step.body.length > CUSTOM_WORKFLOW_TEXT_MAX_LENGTH || (!allowIncompleteDraft && !step.body.trim())) errors.push({ path: `${path}.body`, message: `Text body must be 1 to ${CUSTOM_WORKFLOW_TEXT_MAX_LENGTH} characters.` })
          if (step.body.trim() && !/^(?:Luxor Event Space|Luxor Events|Luxor at Las Palmas Events|Luxor at Las Palmas)\b/i.test(step.body.trim())) errors.push({ path: `${path}.body`, message: 'Start the message with an approved Luxor brand name so the sender is identified.' })
          if (step.body.trim() && !/\bstop\b/i.test(step.body)) errors.push({ path: `${path}.body`, message: 'Include clear STOP instructions in the text.' })
          validateMergeFields(step.body, `${path}.body`, errors)
        }
      }
    } else if (step.type === 'call_task') {
      if (!step.name.trim()) errors.push({ path: `${path}.name`, message: 'Enter a task title for this call.' })
      if (typeof step.dueWithinHours !== 'number' || step.dueWithinHours < 1 || step.dueWithinHours > 168) {
        errors.push({ path: `${path}.dueWithinHours`, message: 'Set a due timeframe between 1 and 168 hours.' })
      }
      if (!['low', 'medium', 'high', 'urgent'].includes(step.priority)) {
        errors.push({ path: `${path}.priority`, message: 'Choose a priority (low, medium, high, urgent).' })
      }
      if (step.scriptNotes) validateMergeFields(step.scriptNotes, `${path}.scriptNotes`, errors)
    } else if (step.type === 'wait') {
      if (!['minutes', 'hours', 'days'].includes(step.unit)) errors.push({ path: `${path}.unit`, message: 'Choose a supported wait unit.' })
      if (step.amount !== null && (!Number.isInteger(step.amount) || step.amount < 0 || step.amount > MAX_WAIT_AMOUNT)) {
        errors.push({ path: `${path}.amount`, message: `Wait must be a whole number from 0 to ${MAX_WAIT_AMOUNT}.` })
      }
      if (step.amount === null && !allowIncompleteDraft) errors.push({ path: `${path}.amount`, message: 'Choose a delay before this workflow can be activated.' })
    } else if (step.type === 'condition') {
      if (!['follow_up_eligible', 'marketing_email_consent', 'marketing_sms_consent', 'tour_scheduled', 'tour_attended', 'unresponsive'].includes(step.condition)) {
        errors.push({ path: `${path}.condition`, message: 'This condition is not supported.' })
      }
      if (step.whenFalse !== 'stop') errors.push({ path: `${path}.whenFalse`, message: 'Conditions can only stop or continue a workflow.' })
    } else if (step.type !== 'end') {
      errors.push({ path: `${path}.type`, message: 'This step type is unavailable.' })
    }
  }

  const endSteps = definition.steps.filter((step) => Boolean(step && typeof step === 'object' && step.type === 'end'))
  if (endSteps.length !== 1 || definition.steps.at(-1)?.type !== 'end') {
    errors.push({ path: 'steps', message: 'A workflow must have exactly one end step, at the end.' })
  }
  return errors
}

function rejectUnexpectedKeys(
  value: object,
  allowed: string[],
  path: string,
  errors: CustomWorkflowDefinitionError[],
) {
  const allowedKeys = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push({ path: `${path}.${key}`, message: 'This workflow field is not supported.' })
  }
}

export function canEditCustomWorkflowStep(step: CustomWorkflowStep) {
  return step.type !== 'email' || step.mode !== 'existing_inquiry_acknowledgment'
}

export function moveCustomWorkflowStep(definition: CustomWorkflowDefinition, stepId: string, direction: -1 | 1) {
  const steps = cloneCustomWorkflowDefinition(definition).steps
  const index = steps.findIndex((step) => step.id === stepId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= steps.length - 1) return definition
  if (steps[index]?.type === 'end' || steps[target]?.type === 'end') return definition
  if (!canEditCustomWorkflowStep(steps[index]) || !canEditCustomWorkflowStep(steps[target])) return definition
  ;[steps[index], steps[target]] = [steps[target], steps[index]]
  return { ...definition, steps }
}

export function removeCustomWorkflowStep(definition: CustomWorkflowDefinition, stepId: string) {
  const target = definition.steps.find((step) => step.id === stepId)
  if (!target || !canEditCustomWorkflowStep(target)) return definition
  const steps = definition.steps.filter((step) => step.id !== stepId)
  if (steps.length === definition.steps.length || steps.at(-1)?.type !== 'end') return definition
  return { ...definition, steps }
}

export function addCustomWorkflowStep(definition: CustomWorkflowDefinition, type: Exclude<CustomWorkflowChannel, 'end'>, id: string) {
  if (definition.steps.length >= MAX_STEPS || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || definition.steps.some((step) => step.id === id)) return definition
  const step: CustomWorkflowStep = type === 'email'
    ? { id, type, mode: 'marketing', name: 'Email follow-up', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '', generationMode: 'manual' }
    : type === 'text'
      ? { id, type, name: 'Marketing text', body: '', requiredConsentScope: 'marketing', generationMode: 'manual' }
      : type === 'call_task'
        ? { id, type, name: 'Phone Call Task', scriptNotes: 'Call {{first_name}} regarding their {{event_type}} inquiry.', dueWithinHours: 4, priority: 'high', assignee: 'Arianna Patterson' }
        : type === 'wait'
          ? { id, type, name: 'Wait', amount: 1, unit: 'days' }
          : { id, type, name: 'Check eligibility', condition: 'follow_up_eligible', whenFalse: 'stop' }
  const steps = [...definition.steps]
  steps.splice(steps.length - 1, 0, step)
  return { ...definition, steps }
}

function validateMergeFields(value: string, path: string, errors: CustomWorkflowDefinitionError[]) {
  const allowed = new Set<string>(CUSTOM_WORKFLOW_ALLOWED_MERGE_FIELDS)
  const valid = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g
  let withoutFields = value
  for (const match of value.matchAll(valid)) {
    if (!allowed.has(match[1])) errors.push({ path, message: `The merge field {{${match[1]}}} is unavailable.` })
  }
  withoutFields = withoutFields.replace(valid, '')
  if (withoutFields.includes('{{') || withoutFields.includes('}}')) errors.push({ path, message: 'Merge fields must use a supported {{field_name}} format.' })
}

function validateLuxorLink(value: unknown, path: string, errors: CustomWorkflowDefinitionError[]) {
  if (typeof value !== 'string') {
    errors.push({ path, message: 'Use a valid Luxor page or the canonical Luxor website.' })
    return
  }
  const target = value.trim()
  if (!target) return
  if (target.startsWith('/') && !target.startsWith('//') && !target.includes('\\')) return
  try {
    const url = new URL(target)
    if (url.protocol !== 'https:' || url.origin !== CANONICAL_LUXOR_ORIGIN || url.username || url.password) {
      errors.push({ path, message: 'Use a Luxor page or the canonical Luxor website.' })
    }
  } catch {
    errors.push({ path, message: 'Use a valid Luxor page or the canonical Luxor website.' })
  }
}
