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
  return supabaseRestRequest<T>(path, init, false)
}

/** Like supabaseRest, but missing tables are errors rather than empty results. */
export async function supabaseRestStrict<T>(path: string, init: RequestInit = {}) {
  return supabaseRestRequest<T>(path, init, true)
}

async function supabaseRestRequest<T>(path: string, init: RequestInit, strict: boolean) {
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

    if (!strict && method === 'GET' && response.status === 404 && payload.code === 'PGRST205') {
      return [] as T
    }

    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  const text = await response.text()
  if (!text) return null as T

  return JSON.parse(text) as T
}

/** Read an exact PostgREST row count without transferring or capping rows. */
export async function supabaseRestCount(path: string) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Supabase count request failed with ${response.status}.`)
  }

  const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
  if (total === undefined) throw new Error('Supabase did not return an exact row count.')
  return Number(total)
}
