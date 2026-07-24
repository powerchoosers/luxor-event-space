import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let clientInstance: SupabaseClient | null = null

export function getPortalSupabaseClient() {
  if (typeof window === 'undefined') return null
  if (clientInstance) return clientInstance

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ofjvbzdwijjnajgjotmx.supabase.co'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!url || !anonKey) return null

  try {
    clientInstance = createClient(url, anonKey, {
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
