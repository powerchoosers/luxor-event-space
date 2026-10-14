import 'server-only'

type SupabaseError = {
  code?: string
  message?: string
  error?: string
  details?: string
  hint?: string
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

export async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const method = (init.method ?? 'GET').toUpperCase()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SupabaseError

    if (method === 'GET' && response.status === 404 && payload.code === 'PGRST205') {
      return [] as T
    }

    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  const text = await response.text()
  if (!text) return null as T

  return JSON.parse(text) as T
}
