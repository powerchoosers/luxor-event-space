import 'server-only'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

type Destination = { id: string; vendor_id: string; sha256: string; created_by: string; kind: 'bill' | 'contract' | 'other' }

// The unique request ID is the concurrency boundary across both upload routes.
// Read after insert, including ignored conflicts, before writing anything else.
export async function claimProviderUploadDestination(claim: Destination): Promise<boolean> {
  await supabaseRestStrict('luxor_provider_upload_destinations?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(claim),
  })
  const [saved] = await supabaseRestStrict<Destination[]>(`luxor_provider_upload_destinations?select=id,vendor_id,sha256,created_by,kind&id=eq.${claim.id}&limit=1`)
  return !!saved && saved.id === claim.id && saved.vendor_id === claim.vendor_id && saved.sha256 === claim.sha256 && saved.created_by === claim.created_by && saved.kind === claim.kind
}
