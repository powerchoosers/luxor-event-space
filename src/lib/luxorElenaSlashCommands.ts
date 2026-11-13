export type ElenaSlashCommandScope = 'system' | 'personal'

export type ElenaSlashCommand = {
  id: string
  trigger: string
  label: string
  hint: string
  scope: ElenaSlashCommandScope
  /** When set, sending this slash expands to this prompt (personal commands). */
  prompt?: string
}

const PERSONAL_STORAGE_PREFIX = 'luxor_elena_personal_slash_commands_v1:'

export const ELENA_SYSTEM_SLASH_COMMANDS: ElenaSlashCommand[] = [
  {
    id: 'system-ticket',
    trigger: 'ticket',
    label: 'Developer ticket',
    hint: 'Open a Braxton cloud fix ticket for this page',
    scope: 'system',
  },
]

function normalizeTrigger(value: string) {
  return value.trim().toLowerCase().replace(/^\//, '').replace(/[^a-z0-9_-]/g, '')
}

export function getElenaSlashQuery(input: string): string | null {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return null
  const withoutSlash = trimmed.slice(1)
  const space = withoutSlash.indexOf(' ')
  if (space >= 0) return withoutSlash.slice(0, space).toLowerCase()
  return withoutSlash.toLowerCase()
}

export function filterElenaSlashCommands(commands: ElenaSlashCommand[], query: string | null) {
  if (query === null) return []
  if (!query) return commands
  return commands.filter((command) => command.trigger.startsWith(query) || command.label.toLowerCase().includes(query))
}

export function parseTicketSlashCommand(raw: string, pagePath: string) {
  const trimmed = raw.trim()
  if (!/^\/ticket(\s|$)/i.test(trimmed)) return null
  const details = trimmed.replace(/^\/ticket\s*/i, '').trim()
  const page = pagePath || '/portal'
  const title = details
    ? (details.length > 140 ? `${details.slice(0, 137)}…` : details)
    : 'Portal issue'
  const description = details || `Issue on ${page}. Arianna opened this with /ticket.`
  return {
    title,
    description,
    priority: 'medium' as const,
    pagePath: page,
  }
}

export function resolvePersonalSlashExpansion(raw: string, commands: ElenaSlashCommand[]): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null
  const match = /^\/([a-z0-9_-]+)\s*(.*)$/i.exec(trimmed)
  if (!match) return null
  const trigger = normalizeTrigger(match[1])
  const rest = match[2]?.trim() || ''
  const personal = commands.find((command) => command.scope === 'personal' && command.trigger === trigger)
  if (!personal?.prompt) return null
  return rest ? `${personal.prompt}\n\n${rest}` : personal.prompt
}

export function loadPersonalElenaSlashCommands(userEmail: string): ElenaSlashCommand[] {
  if (typeof window === 'undefined' || !userEmail) return []
  try {
    const raw = window.localStorage.getItem(`${PERSONAL_STORAGE_PREFIX}${userEmail.toLowerCase()}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ElenaSlashCommand[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const value = item as Record<string, unknown>
      const trigger = normalizeTrigger(String(value.trigger || ''))
      const label = String(value.label || '').trim()
      const prompt = String(value.prompt || '').trim()
      const id = String(value.id || '').trim()
      if (!trigger || !label || !prompt || trigger.length > 32 || label.length > 80 || prompt.length > 2000) continue
      out.push({
        id: id || `personal-${trigger}`,
        trigger,
        label,
        hint: prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt,
        scope: 'personal',
        prompt,
      })
    }
    return out.slice(0, 24)
  } catch {
    return []
  }
}

export function savePersonalElenaSlashCommands(userEmail: string, commands: ElenaSlashCommand[]) {
  if (typeof window === 'undefined' || !userEmail) return
  const personal = commands
    .filter((command) => command.scope === 'personal')
    .map((command) => ({
      id: command.id,
      trigger: command.trigger,
      label: command.label,
      prompt: command.prompt || '',
    }))
  window.localStorage.setItem(`${PERSONAL_STORAGE_PREFIX}${userEmail.toLowerCase()}`, JSON.stringify(personal))
}

export function applySlashCommandToInput(command: ElenaSlashCommand, currentInput: string) {
  const query = getElenaSlashQuery(currentInput)
  if (query === null) return `/${command.trigger} `
  return `/${command.trigger} `
}

export function parseActiveElenaSlashCommand(input: string, commands: ElenaSlashCommand[]) {
  const trimmed = input.trimStart()
  const match = /^\/([a-z0-9_-]+)(\s([\s\S]*))?$/i.exec(trimmed)
  if (!match) return null
  const trigger = match[1].toLowerCase()
  const command = commands.find((item) => item.trigger === trigger)
  if (!command) return null
  return {
    command,
    rest: match[3] ?? '',
  }
}
