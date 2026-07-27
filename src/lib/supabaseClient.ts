import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let clientInstance: SupabaseClient | null = null

export function getPortalSupabaseClient() {
  if (typeof window === 'undefined') return null
  if (clientInstance) return clientInstance

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || ''

  if (!url || !publishableKey) {
    console.warn('Supabase Realtime is unavailable because the public project URL or publishable key is missing.')
    return null
  }

  try {
    clientInstance = createClient(url, publishableKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
    return clientInstance
  } catch (err) {
    console.warn('Failed to initialize Supabase Realtime client:', err)
    return null
  }
}
