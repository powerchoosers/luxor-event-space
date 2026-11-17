'use client'

import { formatLuxorTranscriptElapsed, luxorTranscriptLineStartSeconds } from '@/lib/luxorTranscriptDisplay'
import { luxorElenaLiveInboundTranscriptUsesSipBridge, luxorTranscriptSpeaker } from '@/lib/luxorCallTypes'

const RECORDING_STARTED = '2026-11-16T02:07:28.000Z'
const CALL_METADATA = { scope: 'elena_live_inbound' as const }
const SEGMENTS = [
  { id: '1', track: 'luxor_agent', text: 'Luxor at Las Palmas Events, this is Elena. How can I help you plan your celebration?', timestamp: '2026-11-16T02:07:35.000Z', startSeconds: 7 },
  { id: '2', track: 'caller', text: 'Hi, I am calling about a quinceañera next spring.', timestamp: '2026-11-16T02:07:42.000Z', startSeconds: 14 },
  { id: '3', track: 'luxor_agent', text: 'Wonderful. I can share package options and available tour times.', timestamp: '2026-11-16T02:07:55.000Z', startSeconds: 27 },
  { id: '4', track: 'caller', text: 'Could we tour on a Saturday afternoon?', timestamp: '2026-11-16T02:08:10.000Z', startSeconds: 42 },
  { id: '5', track: 'luxor_agent', text: 'Yes. I will email published tour slots after we confirm your address.', timestamp: '2026-11-16T02:08:22.000Z', startSeconds: 54 },
]

export default function PortalCallTranscriptPreviewPage({ theme }: { theme?: 'light' | 'dark' }) {
  return (
    <main className={theme === 'dark' ? 'dark' : ''} data-theme={theme === 'dark' ? 'dark' : 'light'}>
      <div className="mx-auto max-w-md bg-[color:var(--portal-bg,#f7f4ef)] p-4 text-[color:var(--portal-text,#2c2419)] min-h-screen sm:max-w-3xl">
        <h1 className="mb-3 text-lg font-semibold">Call transcript (fixture)</h1>
        <div className="rounded-2xl border border-[color:var(--portal-border,#e6ddd0)] bg-[color:var(--portal-card,#fff)] shadow-sm">
          <div className="max-h-96 overflow-y-auto divide-y divide-[color:var(--portal-border)]/50 p-3 sm:p-4">
            {SEGMENTS.map((segment) => {
              const lineStartSeconds = luxorTranscriptLineStartSeconds(segment, RECORDING_STARTED)
              const speaker = luxorTranscriptSpeaker(segment.track, { elenaSipBridge: luxorElenaLiveInboundTranscriptUsesSipBridge(CALL_METADATA) })
              return (
                <div key={segment.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                  <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums font-medium text-[#a8792f] dark:text-[#f1d27a]">
                    {formatLuxorTranscriptElapsed(lineStartSeconds)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-[color:var(--portal-muted,#6b5b4b)]">
                      {speaker === 'caller' ? 'Caller' : 'Luxor'}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed">{segment.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}