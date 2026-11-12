'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Global in-memory cache shared across client-side components
const portalMemoryCache = new Map<string, CacheEntry<unknown>>()
const listeners = new Map<string, Set<() => void>>()
const inflightRequests = new Map<string, Promise<unknown>>()

function subscribeKey(key: string, callback: () => void) {
  let keyListeners = listeners.get(key)
  if (!keyListeners) {
    keyListeners = new Set()
    listeners.set(key, keyListeners)
  }
  keyListeners.add(callback)
  return () => {
    keyListeners?.delete(callback)
    if (keyListeners?.size === 0) {
      listeners.delete(key)
    }
  }
}

function notifyKey(key: string) {
  const keyListeners = listeners.get(key)
  if (keyListeners) {
    keyListeners.forEach((cb) => {
      try {
        cb()
      } catch {
        // ignore subscriber errors
      }
    })
  }
}

export function setPortalCache<T>(key: string, data: T): void {
  portalMemoryCache.set(key, { data, timestamp: Date.now() })
  notifyKey(key)
}

export function getPortalCache<T>(key: string): T | undefined {
  const entry = portalMemoryCache.get(key)
  return entry ? (entry.data as T) : undefined
}

export function clearPortalCache(key?: string): void {
  if (key) {
    portalMemoryCache.delete(key)
    notifyKey(key)
  } else {
    portalMemoryCache.clear()
    listeners.forEach((set) => set.forEach((cb) => cb()))
  }
}

/**
 * Lightweight, zero-dependency Stale-While-Revalidate (SWR) hook for portal client pages.
 * - If cached data exists in memory, returns immediately (no skeleton flashing).
 * - Transparently revalidates in background unless cache is fresher than maxAgeMs.
 * - Deduplicates in-flight requests for the same key.
 */
export function usePortalSWR<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: {
    maxAgeMs?: number // how long cached data is considered fresh before background revalidation (default 15s)
    enabled?: boolean
    revalidateOnFocus?: boolean
  } = {}
) {
  const { maxAgeMs = 15000, enabled = true, revalidateOnFocus = false } = options

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!key || !enabled) return () => {}
      return subscribeKey(key, callback)
    },
    [key, enabled]
  )

  const getSnapshot = useCallback(() => {
    if (!key || !enabled) return undefined
    return portalMemoryCache.get(key)?.data as T | undefined
  }, [key, enabled])

  const cachedData = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  const [loading, setLoading] = useState<boolean>(() => {
    if (!key || !enabled) return false
    return portalMemoryCache.get(key) === undefined
  })
  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)

  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const revalidate = useCallback(async (quiet = false): Promise<T | undefined> => {
    if (!key || !enabled) return undefined

    const hasCached = portalMemoryCache.has(key)
    if (!quiet && !hasCached) {
      setLoading(true)
    }
    setIsValidating(true)
    setError(null)

    let inflight = inflightRequests.get(key) as Promise<T> | undefined
    if (!inflight) {
      inflight = fetcherRef.current().then(
        (data) => {
          portalMemoryCache.set(key, { data, timestamp: Date.now() })
          notifyKey(key)
          inflightRequests.delete(key)
          return data
        },
        (err) => {
          inflightRequests.delete(key)
          throw err
        }
      )
      inflightRequests.set(key, inflight)
    }

    try {
      const data = await inflight
      return data
    } catch (err) {
      const parsedError = err instanceof Error ? err : new Error(String(err))
      setError(parsedError)
      return undefined
    } finally {
      setLoading(false)
      setIsValidating(false)
    }
  }, [key, enabled])

  useEffect(() => {
    if (!key || !enabled) return

    const entry = portalMemoryCache.get(key)
    const isStale = !entry || Date.now() - entry.timestamp > maxAgeMs

    if (!entry) {
      void revalidate(false)
    } else if (isStale) {
      void revalidate(true)
    }
  }, [key, enabled, maxAgeMs, revalidate])

  useEffect(() => {
    if (!key || !enabled || !revalidateOnFocus) return

    const handleFocus = () => {
      const entry = portalMemoryCache.get(key)
      if (!entry || Date.now() - entry.timestamp > maxAgeMs) {
        void revalidate(true)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [key, enabled, revalidateOnFocus, maxAgeMs, revalidate])

  return {
    data: cachedData,
    loading: loading && !cachedData,
    isValidating,
    error,
    mutate: (newData: T) => setPortalCache(key!, newData),
    revalidate,
  }
}
