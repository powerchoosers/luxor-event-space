'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ElenaDeveloperSupportCard,
  type DeveloperSupportCardPayload,
  type DeveloperSupportSubmittedSnapshot,
} from '@/components/portal/ElenaCRMContainers'

export const DEVELOPER_SUPPORT_CARD_QA_SESSION_ID = '00000000-0000-4000-8000-000000000111'

export const DEVELOPER_SUPPORT_CARD_QA_INITIAL: DeveloperSupportCardPayload = {
  title: 'Lead inbox refresh spinner never clears',
  description: 'On /portal/leads the header refresh spins for 30+ seconds. Expected completed tasks to update without a full page reload.',
  priority: 'high',
  pagePath: '/portal/leads',
}

function cardFromSessionMessages(
  messages: Array<{ developerSupportCard?: DeveloperSupportCardPayload }> | undefined,
): DeveloperSupportCardPayload {
  return messages?.find((message) => message.developerSupportCard)?.developerSupportCard || DEVELOPER_SUPPORT_CARD_QA_INITIAL
}

export default function DeveloperSupportCardBrowserFixture() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [cardKey, setCardKey] = useState(0)
  const [payload, setPayload] = useState<DeveloperSupportCardPayload>(DEVELOPER_SUPPORT_CARD_QA_INITIAL)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    document.body.setAttribute('data-portal-theme', theme)
    return () => document.body.removeAttribute('data-portal-theme')
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/portal/elena-chat/sessions?id=${DEVELOPER_SUPPORT_CARD_QA_SESSION_ID}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { messages?: Array<{ developerSupportCard?: DeveloperSupportCardPayload }> } | null) => {
        if (cancelled || !data) return
        const next = cardFromSessionMessages(data.messages)
        setPayload(next)
        setCardKey((value) => value + 1)
        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persistSubmitted = useCallback(async (snapshot: DeveloperSupportSubmittedSnapshot) => {
    const next: DeveloperSupportCardPayload = {
      ...payload,
      title: snapshot.title,
      description: snapshot.description || undefined,
      priority: snapshot.priority,
      pagePath: snapshot.pagePath || undefined,
      submitted: snapshot,
    }
    await fetch('/api/portal/elena-chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: DEVELOPER_SUPPORT_CARD_QA_SESSION_ID,
        messages: [{ role: 'assistant', content: 'QA fixture', developerSupportCard: next }],
      }),
    })
    setPayload(next)
  }, [payload])

  const resetCard = useCallback(async () => {
    const initial = DEVELOPER_SUPPORT_CARD_QA_INITIAL
    await fetch('/api/portal/elena-chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: DEVELOPER_SUPPORT_CARD_QA_SESSION_ID,
        messages: [{ role: 'assistant', content: 'QA fixture', developerSupportCard: initial }],
      }),
    })
    setPayload(initial)
    setCardKey((value) => value + 1)
  }, [])

  const chatId = useMemo(() => '00000000-0000-4000-8000-000000000222', [])

  return (
    <main className="min-h-[100dvh] bg-[color:var(--portal-bg)] p-4 sm:p-8" data-qa-hydrated={hydrated ? 'true' : 'false'}>
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
          data-qa-reset
          onClick={() => void resetCard()}
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