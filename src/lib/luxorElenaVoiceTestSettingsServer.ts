import 'server-only'
import { supabaseRestStrict } from './supabaseRestServer'

export async function getElenaPhoneTestVoice() {
  const [settings] = await supabaseRestStrict<Array<{ voice: string }>>('luxor_elena_voice_test_settings?select=voice&id=eq.1&limit=1')
  if (!settings?.voice) throw new Error('The phone test voice setting is unavailable.')
  return settings.voice
}

export async function saveElenaPhoneTestVoice(voice: string, actor: string) {
  const [saved] = await supabaseRestStrict<Array<{ voice: string }>>('luxor_elena_voice_test_settings?id=eq.1&select=voice', {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ voice, updated_by: actor, updated_at: new Date().toISOString() }),
  })
  if (saved?.voice !== voice) throw new Error('The phone test voice could not be saved.')
  return saved.voice
}
