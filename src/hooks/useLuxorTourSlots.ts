'use client'

import { useEffect, useState } from 'react'
import type { PublicLuxorTourSlot } from '@/lib/luxorTourSlots'

export function useLuxorTourSlots() {
  const [slots, setSlots] = useState<PublicLuxorTourSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadSlots() {
      try {
        const response = await fetch('/api/tour-slots', { cache: 'no-store' })
        const data = (await response.json().catch(() => ({}))) as {
          slots?: PublicLuxorTourSlot[]
          error?: string
        }

        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load tour availability.')
        }

        if (active) {
          setSlots(data.slots ?? [])
          setError(null)
        }
      } catch (slotError) {
        if (active) {
          setSlots([])
          setError(slotError instanceof Error ? slotError.message : 'Unable to load tour availability.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadSlots()

    return () => {
      active = false
    }
  }, [])

  return { slots, loading, error }
}
