import 'server-only'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { parsePortalFixNotice, type PortalFixNotice } from '@/lib/luxorPortalFixNotice'

export async function getActivePortalFixNotice(): Promise<PortalFixNotice | null> {
  try {
    const rows = await supabaseRest<unknown[]>(
      'luxor_portal_fix_notices?is_active=eq.true&select=id,banner_label,title,summary,fixed_text,unchanged_text,steps,if_stuck&order=created_at.desc&limit=1',
    )
    return parsePortalFixNotice(rows[0])
  } catch {
    return null
  }
}
