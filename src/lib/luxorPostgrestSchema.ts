import { SupabaseRestError } from '@/lib/supabaseRestServer'

/** Missing table, column, or RPC in the current production schema. */
export function postgrestSchemaUnavailable(error: unknown) {
  if (!(error instanceof SupabaseRestError)) return false
  if (['PGRST202', 'PGRST204', 'PGRST205', '42703'].includes(error.code || '')) return true
  return /does not exist/i.test(error.message)
}
