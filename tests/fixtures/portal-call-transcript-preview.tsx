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

export default function PortalCallTranscriptPreview() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xs">
        <div className="border-b border-[color:var(--portal-border)]/60 px-4 py-3">
          <p className="text-sm font-semibold text-[color:var(--portal-text)]">Transcript</p>
        </div>
        <div className="max-h-[32rem] overflow-y-auto divide-y divide-[color:var(--portal-border)]/50 p-3 sm:p-4 portal-scrollbar">
          {SEGMENTS.map((segment) => {
            const lineStartSeconds = luxorTranscriptLineStartSeconds(segment, RECORDING_STARTED)
            const speaker = luxorTranscriptSpeaker(segment.track, { elenaSipBridge: luxorElenaLiveInboundTranscriptUsesSipBridge(CALL_METADATA) })
            return (
              <div key={segment.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums font-medium text-[#a8792f] dark:text-[#f1d27a]">
                  {formatLuxorTranscriptElapsed(lineStartSeconds)}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-[color:var(--portal-muted)]">
                    {speaker === 'caller' ? 'Caller' : 'Luxor'}
                  </span>
                  <p className="mt-0.5 text-sm leading-relaxed text-[color:var(--portal-text)]">{segment.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}