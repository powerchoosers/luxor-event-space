import 'server-only'
import { supabaseRestStrict } from './supabaseRestServer'

export type ElenaInboundSettings = { voice: 'brise' | 'nira'; ariannaAvailable: boolean }
type SettingsRow = { voice: string; arianna_available: boolean }

function parseSettings(row: SettingsRow | undefined): ElenaInboundSettings {
  if (!row || (row.voice !== 'brise' && row.voice !== 'nira') || typeof row.arianna_available !== 'boolean') throw new Error('Elena inbound settings are unavailable.')
  return { voice: row.voice, ariannaAvailable: row.arianna_available }
}

export async function getElenaInboundSettings(): Promise<ElenaInboundSettings> {
  const [row] = await supabaseRestStrict<SettingsRow[]>('luxor_elena_inbound_settings?select=voice,arianna_available&id=eq.1&limit=1')
  return parseSettings(row)
}

export async function saveElenaInboundSettings(patch: Partial<ElenaInboundSettings>, actor: string): Promise<ElenaInboundSettings> {
  const body: Record<string, unknown> = { updated_by: actor.toLowerCase(), updated_at: new Date().toISOString() }
  if (patch.voice !== undefined) body.voice = patch.voice
  if (patch.ariannaAvailable !== undefined) body.arianna_available = patch.ariannaAvailable
  const [row] = await supabaseRestStrict<SettingsRow[]>('luxor_elena_inbound_settings?id=eq.1&select=voice,arianna_available', {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  return parseSettings(row)
}
