'use client'

import { useEffect, useSyncExternalStore } from 'react'

type PortalLoadingListener = () => void

const portalLoadingListeners = new Set<PortalLoadingListener>()
let isPortalLoadingGlobal = false
let safetyTimer: ReturnType<typeof setTimeout> | null = null

function subscribe(callback: PortalLoadingListener) {
  portalLoadingListeners.add(callback)
  return () => {
    portalLoadingListeners.delete(callback)
  }
}

function getSnapshot() {
  return isPortalLoadingGlobal
}

function getServerSnapshot() {
  return false
}

export function setPortalLoadingSignal(loading: boolean) {
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }

  // Safety watchdog: never let portal loading stay stuck on indefinitely
  if (loading) {
    safetyTimer = setTimeout(() => {
      setPortalLoadingSignal(false)
    }, 12000)
  }

  if (isPortalLoadingGlobal === loading) return
  isPortalLoadingGlobal = loading
  portalLoadingListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore observer errors
    }
  })
}

export function usePortalLoadingState(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function usePortalLoadingSignal() {
  useEffect(() => {
    setPortalLoadingSignal(true)
    return () => {
      setPortalLoadingSignal(false)
    }
  }, [])
}
