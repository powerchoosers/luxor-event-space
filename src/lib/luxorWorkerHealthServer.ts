import 'server-only'

import { supabaseRest } from './supabaseRestServer'

export type LuxorWorkerName = 'email_jobs' | 'text_jobs'

export type LuxorWorkerHealth = {
  worker_name: LuxorWorkerName
  last_authorized_at: string
  last_processed_at: string | null
  last_status: 'healthy' | 'idle' | 'error'
  last_error: string | null
  metadata: Record<string, unknown>
  updated_at: string
}

export async function recordLuxorWorkerHealth(
  workerName: LuxorWorkerName,
  data: {
    status: LuxorWorkerHealth['last_status']
    processed?: number
    error?: string | null
    metadata?: Record<string, unknown>
  },
) {
  const now = new Date().toISOString()
  await supabaseRest<LuxorWorkerHealth[]>(
    'luxor_worker_health?on_conflict=worker_name',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        worker_name: workerName,
        last_authorized_at: now,
        last_processed_at: data.processed ? now : null,
        last_status: data.status,
        last_error: data.error || null,
        metadata: {
          processed: data.processed || 0,
          ...(data.metadata || {}),
        },
        updated_at: now,
      }),
    },
  )
}

export async function getLuxorWorkerHealth(workerName: LuxorWorkerName) {
  const rows = await supabaseRest<LuxorWorkerHealth[]>(
    `luxor_worker_health?select=*&worker_name=eq.${encodeURIComponent(workerName)}&limit=1`,
  )
  return rows[0] ?? null
}

export async function safelyRecordLuxorWorkerHealth(
  workerName: LuxorWorkerName,
  data: Parameters<typeof recordLuxorWorkerHealth>[1],
) {
  try {
    await recordLuxorWorkerHealth(workerName, data)
  } catch (error) {
    console.error(
      `Unable to record ${workerName} worker health:`,
      error instanceof Error ? error.message : error,
    )
  }
}
