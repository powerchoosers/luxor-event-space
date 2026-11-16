'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ElenaDeveloperSupportCard,
  type DeveloperSupportCardPayload,
  type DeveloperSupportSubmittedSnapshot,
} from '@/components/portal/ElenaCRMContainers'

const STORAGE_KEY = 'luxor-dev-support-card-qa-payload'

const INITIAL_PAYLOAD: DeveloperSupportCardPayload = {
  title: 'Lead inbox refresh spinner never clears',
  description: 'On /portal/leads the header refresh spins for 30+ seconds. Expected completed tasks to update without a full page reload.',
  priority: 'high',
  pagePath: '/portal/leads',
}

function installFetchMock(
  onPersisted: (card: DeveloperSupportCardPayload) => void,
) {
  const original = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const method = (init?.method || 'GET').toUpperCase()
    if (url.includes('/api/portal/elena-chat/actions') && method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (body.action === 'PREPARE_DEVELOPER_SUPPORT') {
        return new Response(JSON.stringify({
          confirmation: {
            token: 'qa.developer-support.confirmation',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            summary: 'Send developer support ticket as Arianna Patterson',
            reporterName: 'Arianna Patterson',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (body.action === 'CONFIRM_DEVELOPER_SUPPORT') {
        return new Response(JSON.stringify({
          success: true,
          result: {
            confirmation_id: '11111111-1111-4111-8111-111111111111',
            dispatch: { runUuid: 'qa-run-uuid', backgroundComposerId: null },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: 'Unexpected QA action' }), { status: 400 })
    }
    if (url.includes('/api/portal/elena-chat/sessions') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ developerSupportCard?: DeveloperSupportCardPayload }> }
      const card = body.messages?.find((message) => message.developerSupportCard)?.developerSupportCard
      if (card) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(card))
        onPersisted(card)
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/api/portal/elena-chat/sessions') && method === 'GET') {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      const card = stored ? JSON.parse(stored) as DeveloperSupportCardPayload : INITIAL_PAYLOAD
      return new Response(JSON.stringify({
        messages: [{ role: 'assistant', content: 'QA fixture', developerSupportCard: card }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return original(input, init)
  }
  return () => {
    globalThis.fetch = original
  }
}

export default function DeveloperSupportCardBrowserFixture() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [cardKey, setCardKey] = useState(0)
  const [payload, setPayload] = useState<DeveloperSupportCardPayload>(INITIAL_PAYLOAD)

  const readStoredPayload = useCallback(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return INITIAL_PAYLOAD
    try {
      return JSON.parse(stored) as DeveloperSupportCardPayload
    } catch {
      return INITIAL_PAYLOAD
    }
  }, [])

  useEffect(() => {
    document.body.setAttribute('data-portal-theme', theme)
    return () => document.body.removeAttribute('data-portal-theme')
  }, [theme])

  useEffect(() => installFetchMock(setPayload), [])

  const persistSubmitted = useCallback(async (snapshot: DeveloperSupportSubmittedSnapshot) => {
    const next: DeveloperSupportCardPayload = {
      ...payload,
      title: snapshot.title,
      description: snapshot.description || undefined,
      priority: snapshot.priority,
      pagePath: snapshot.pagePath || undefined,
      submitted: snapshot,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    await fetch('/api/portal/elena-chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000111',
        messages: [{ role: 'assistant', content: 'QA fixture', developerSupportCard: next }],
      }),
    })
    setPayload(next)
  }, [payload])

  const simulateReload = useCallback(() => {
    const next = readStoredPayload()
    setPayload(next)
    setCardKey((value) => value + 1)
  }, [readStoredPayload])

  const resetCard = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setPayload(INITIAL_PAYLOAD)
    setCardKey((value) => value + 1)
  }, [])

  const chatId = useMemo(() => '00000000-0000-4000-8000-000000000222', [])

  return (
    <main className="min-h-[100dvh] bg-[color:var(--portal-bg)] p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-2" data-qa-controls>
        <button
          type="button"
          data-qa-theme="light"
          onClick={() => setTheme('light')}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)]"
        >
          Portal light
        </button>
        <button
          type="button"
          data-qa-theme="dark"
          onClick={() => setTheme('dark')}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)]"
        >
          Portal dark
        </button>
        <button
          type="button"
          data-qa-reload
          onClick={simulateReload}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)]"
        >
          Simulate chat reload
        </button>
        <button
          type="button"
          data-qa-reset
          onClick={resetCard}
          className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)]"
        >
          Reset card
        </button>
      </div>
      <div className="w-[96%] max-w-5xl pl-2 sm:pl-8" data-qa-card-host>
        <ElenaDeveloperSupportCard
          key={cardKey}
          payload={payload}
          chatId={chatId}
          onSubmitted={(snapshot) => void persistSubmitted(snapshot)}
        />
      </div>
    </main>
  )
}