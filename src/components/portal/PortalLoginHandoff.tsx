'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LuxorWordmark } from '@/components/LuxorWordmark'

const HandoffContext = createContext({ begin: async () => {}, finish: () => {} })

export function PortalLoginHandoffProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const activeRef = useRef(false)
  const overlay = useRef<HTMLDivElement>(null)
  const begin = useCallback(async () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    await new Promise<void>((resolve) => {
      const node = overlay.current
      const done = () => { clearTimeout(fallback); node?.removeEventListener('transitionend', ended); resolve() }
      const ended = (event: TransitionEvent) => { if (event.target === node && event.propertyName === 'opacity') done() }
      const fallback = window.setTimeout(done, 500)
      node?.addEventListener('transitionend', ended)
      activeRef.current = true
      setLeaving(false)
      setActive(true)
    })
  }, [])
  const finish = useCallback(() => {
    if (activeRef.current) setLeaving(true)
    activeRef.current = false
    setActive(false)
  }, [])
  return (
    <HandoffContext.Provider value={{ begin, finish }}>
      {children}
      <div ref={overlay} onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'opacity' && !active) setLeaving(false) }} className={`portal-login-handoff ${active ? 'portal-login-handoff-active' : ''} ${leaving ? 'portal-login-handoff-leaving' : ''}`} aria-hidden="true">
        <LuxorWordmark compact horizontal subline={false} className="[&_.luxor-wordmark]:!text-[2.2rem]" />
      </div>
    </HandoffContext.Provider>
  )
}

export const usePortalLoginHandoff = () => useContext(HandoffContext)

export function PortalLogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter()
  const { begin } = usePortalLoginHandoff()
  const pending = useRef(false)
  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    try {
      await begin()
      const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' })
      if (!response.ok || !response.redirected || new URL(response.url).pathname !== '/portal/login') throw new Error('Sign out could not be confirmed')
      router.replace('/portal/login')
    } catch {
      window.location.assign('/api/auth/logout')
    }
  }
  return <form action="/api/auth/logout" method="post" className={className} onSubmit={signOut}>{children}</form>
}

export function PortalAuthArrival({ children }: { children: ReactNode }) {
  const { finish } = usePortalLoginHandoff()
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(finish)
    return () => cancelAnimationFrame(frame)
  }, [finish])
  return children
}

export function PortalLoginArrival({ children }: { children: ReactNode }) {
  const { finish } = usePortalLoginHandoff()
  useLayoutEffect(() => {
    document.body.classList.add('portal-shell', 'overflow-hidden')
    const frame = requestAnimationFrame(finish)
    return () => {
      cancelAnimationFrame(frame)
      document.body.classList.remove('portal-shell', 'overflow-hidden')
    }
  }, [finish])
  return children
}
