import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import { CALENDAR_MESSAGE_KEYS, validateCalendarCancellationCopy, validateCalendarUpdateCopy, type CalendarCancellationCopy, type CalendarMessageCopyMap, type CalendarMessageKey, type CalendarUpdateCopy } from './luxorCalendarMessageCopy'

export type CalendarMessageSetting = {
  key: CalendarMessageKey
  copy_override: CalendarCancellationCopy | CalendarUpdateCopy | null
  revision: number
  updated_at: string
  updated_by: string | null
}

export async function readCalendarMessageSettings(): Promise<{ settings: CalendarMessageSetting[]; installed: boolean }> {
  const fallback = CALENDAR_MESSAGE_KEYS.map((key) => ({ key, copy_override: null, revision: 0, updated_at: '', updated_by: null }))
  try {
    const rows = await supabaseRestStrict<CalendarMessageSetting[]>('luxor_calendar_message_copy_settings?select=key,copy_override,revision,updated_at,updated_by')
    if (rows.length !== CALENDAR_MESSAGE_KEYS.length || CALENDAR_MESSAGE_KEYS.some((key) => !rows.some((row) => row.key === key))) {
      throw new Error('Calendar message settings are incomplete.')
    }
    for (const row of rows) {
      if (row.copy_override === null) continue
      if (row.key === 'cancellation') validateCalendarCancellationCopy(row.copy_override)
      else validateCalendarUpdateCopy(row.copy_override)
    }
    return { settings: rows, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { settings: fallback, installed: false }
    throw error
  }
}

export async function saveCalendarMessageSetting(key: CalendarMessageKey, copy: unknown, revision: unknown, actor: string) {
  if (!CALENDAR_MESSAGE_KEYS.includes(key)) throw new Error('Unknown calendar message.')
  const value = copy === null
    ? null
    : key === 'cancellation' ? validateCalendarCancellationCopy(copy) : validateCalendarUpdateCopy(copy)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [row] = await supabaseRestStrict<CalendarMessageSetting[]>(`luxor_calendar_message_copy_settings?key=eq.${key}&revision=eq.${revision}&select=key,copy_override,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ copy_override: value, revision: Number(revision) + 1, updated_at: new Date().toISOString(), updated_by: actor.toLowerCase() }),
  })
  if (!row) throw new Error('This message changed. Reload before saving.')
  return row
}

export async function readCalendarMessageCopyMap(): Promise<CalendarMessageCopyMap | null> {
  const { settings, installed } = await readCalendarMessageSettings()
  if (!installed) return null
  const cancellation = settings.find((row) => row.key === 'cancellation')?.copy_override
  const update = settings.find((row) => row.key === 'update')?.copy_override
  return {
    cancellation: cancellation ? validateCalendarCancellationCopy(cancellation) : null,
    update: update ? validateCalendarUpdateCopy(update) : null,
  }
}
