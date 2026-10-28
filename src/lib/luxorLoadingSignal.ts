'use client'

import { useEffect, useSyncExternalStore } from 'react'

type PortalLoadingListener = () => void

const listeners = new Set<PortalLoadingListener>()

let isInitialOverlayActive = false
let isRouteLoadingActive = false
let initialSyncDone = false
let safetyTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore
    }
  })
}

function subscribe(callback: PortalLoadingListener) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function hasCompletedInitialSync(): boolean {
  if (typeof window === 'undefined') return true
  if (initialSyncDone) return true
  try {
    if (sessionStorage.getItem('luxor_portal_synced') === 'true') {
      initialSyncDone = true
      return true
    }
  } catch {
    // ignore
  }
  return false
}

export function markInitialSyncComplete() {
  initialSyncDone = true
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('luxor_portal_synced', 'true')
    }
  } catch {
    // ignore
  }
  if (isInitialOverlayActive) {
    isInitialOverlayActive = false
    notify()
  }
}

export function setPortalInitialOverlay(active: boolean) {
  if (isInitialOverlayActive === active) return
  isInitialOverlayActive = active
  notify()
}

export function setRouteLoadingSignal(active: boolean) {
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }

  if (active) {
    safetyTimer = setTimeout(() => {
      setRouteLoadingSignal(false)
    }, 10000)
  }

  if (isRouteLoadingActive === active) return
  isRouteLoadingActive = active
  notify()
}

export interface PortalLoadingStatus {
  isInitialOverlay: boolean
  isRouteLoading: boolean
}

let cachedSnapshot: PortalLoadingStatus = {
  isInitialOverlay: false,
  isRouteLoading: false,
}

function getSnapshot(): PortalLoadingStatus {
  if (
    cachedSnapshot.isInitialOverlay !== isInitialOverlayActive ||
    cachedSnapshot.isRouteLoading !== isRouteLoadingActive
  ) {
    cachedSnapshot = {
      isInitialOverlay: isInitialOverlayActive,
      isRouteLoading: isRouteLoadingActive,
    }
  }
  return cachedSnapshot
}

const serverSnapshot: PortalLoadingStatus = {
  isInitialOverlay: false,
  isRouteLoading: false,
}

function getServerSnapshot(): PortalLoadingStatus {
  return serverSnapshot
}

export function usePortalLoadingState(): PortalLoadingStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function usePortalLoadingSignal(pathname?: string) {
  useEffect(() => {
    const isHome = pathname === '/portal'
    const needsInitialSync = isHome && !hasCompletedInitialSync()

    if (needsInitialSync) {
      setPortalInitialOverlay(true)
    } else {
      setRouteLoadingSignal(true)
    }

    return () => {
      if (needsInitialSync) {
        // Will be marked complete by the presentation timer in RouteTransition
      } else {
        setRouteLoadingSignal(false)
      }
    }
  }, [pathname])
}
