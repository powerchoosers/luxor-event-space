'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from '@/lib/icons/phosphor-compat'

export type PortalAudioPlayerVariant = 'full' | 'compact' | 'inline' | 'voicemail-card'

export interface PortalAudioPlayerProps {
  src: string
  audioId?: string
  title?: string
  subtitle?: string
  durationSeconds?: number | null
  variant?: PortalAudioPlayerVariant
  showWaveform?: boolean
  seekToSeconds?: number | null
  downloadFilename?: string
  className?: string
  autoPlay?: boolean
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onPlayStateChange?: (isPlaying: boolean) => void
  onEnded?: () => void
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2]

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Shared React Audio Player component for the Luxor Owner Portal.
 * Modeled after iOS Visual Voicemail & Voice Memos with restrained, tactile controls.
 */
export function PortalAudioPlayer({
  src,
  audioId,
  title,
  subtitle,
  durationSeconds,
  variant = 'full',
  showWaveform = true,
  seekToSeconds = null,
  downloadFilename,
  className = '',
  autoPlay = false,
  onTimeUpdate,
  onPlayStateChange,
  onEnded,
}: PortalAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrubberRef = useRef<HTMLDivElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState<number>(0)
  const duration = audioDuration > 0 ? audioDuration : (durationSeconds && durationSeconds > 0 ? durationSeconds : 0)
  const [rateIndex, setRateIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)

  // Deterministic voice-cadence waveform heights based on src
  const waveformHeights = useMemo(() => {
    const barsCount = variant === 'compact' || variant === 'inline' ? 32 : 48
    let hash = 0
    for (let i = 0; i < src.length; i++) {
      hash = (hash << 5) - hash + src.charCodeAt(i)
      hash |= 0
    }
    const bars: number[] = []
    for (let i = 0; i < barsCount; i++) {
      const waveA = Math.abs(Math.sin((hash + i * 13) * 0.42))
      const waveB = Math.abs(Math.cos((hash + i * 7) * 0.27))
      const envelope = Math.sin((i / barsCount) * Math.PI) * 0.35 + 0.65
      const heightPercent = Math.max(18, Math.min(96, Math.round(((waveA * 0.6 + waveB * 0.4) * envelope) * 82 + 16)))
      bars.push(heightPercent)
    }
    return bars
  }, [src, variant])

  // External seek handler (e.g. clicking a transcript line)
  useEffect(() => {
    if (seekToSeconds != null && Number.isFinite(seekToSeconds) && audioRef.current) {
      const target = Math.max(0, Math.min(seekToSeconds, duration || 9999))
      audioRef.current.currentTime = target
      if (audioRef.current.paused) {
        void audioRef.current.play().catch(() => undefined)
      }
    }
  }, [seekToSeconds, duration])

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      if (audio.paused) {
        setIsLoading(true)
        await audio.play()
        setIsLoading(false)
        setIsPlaying(true)
        onPlayStateChange?.(true)
      } else {
        audio.pause()
        setIsPlaying(false)
        onPlayStateChange?.(false)
      }
    } catch {
      setIsLoading(false)
    }
  }, [onPlayStateChange])

  const jumpTime = useCallback((offsetSeconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const maxTime = duration || audio.duration || 9999
    const newTime = Math.max(0, Math.min(audio.currentTime + offsetSeconds, maxTime))
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  const cyclePlaybackRate = useCallback(() => {
    const nextIndex = (rateIndex + 1) % PLAYBACK_RATES.length
    setRateIndex(nextIndex)
    const nextRate = PLAYBACK_RATES[nextIndex]
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }, [rateIndex])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    audio.muted = nextMuted
  }, [isMuted])

  const getScrubPercent = useCallback((clientX: number) => {
    if (!scrubberRef.current) return 0
    const rect = scrubberRef.current.getBoundingClientRect()
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width))
    return rect.width > 0 ? offsetX / rect.width : 0
  }, [])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsSeeking(true)
    const pct = getScrubPercent(e.clientX)
    const targetTime = pct * (duration || 1)
    setCurrentTime(targetTime)
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return
    const pct = getScrubPercent(e.clientX)
    const targetTime = pct * (duration || 1)
    setCurrentTime(targetTime)
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsSeeking(false)
  }

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const remainingTime = Math.max(0, duration - currentTime)

  const sharedAudioElement = (
    <audio
      id={audioId}
      ref={audioRef}
      src={src}
      preload="metadata"
      autoPlay={autoPlay}
      onLoadedMetadata={(e) => {
        setIsLoading(false)
        const d = (e.currentTarget as HTMLAudioElement).duration
        if (Number.isFinite(d) && d > 0) setAudioDuration(d)
      }}
      onWaiting={() => setIsLoading(true)}
      onCanPlay={() => setIsLoading(false)}
      onTimeUpdate={(e) => {
        if (!isSeeking) {
          const curr = (e.currentTarget as HTMLAudioElement).currentTime
          setCurrentTime(curr)
          onTimeUpdate?.(curr, duration)
        }
      }}
      onPlay={() => {
        setIsLoading(false)
        setIsPlaying(true)
      }}
      onPause={() => setIsPlaying(false)}
      onEnded={() => {
        setIsPlaying(false)
        onEnded?.()
      }}
    />
  )

  // Compact / Inline Strip (for inline list rows or lead activity timeline)
  if (variant === 'compact' || variant === 'inline') {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/70 px-3 py-2.5 text-xs ${className}`}
      >
        {sharedAudioElement}

        <button
          type="button"
          onClick={() => void togglePlay()}
          className="luxor-gold-raised flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white cursor-pointer focus-visible:outline-none"
          aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={13} weight="fill" />
          ) : (
            <Play size={13} weight="fill" className="ml-0.5" />
          )}
        </button>

        <div
          ref={scrubberRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration || 0)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') jumpTime(5)
            if (e.key === 'ArrowLeft') jumpTime(-5)
          }}
          className="relative flex-1 h-7 flex items-center cursor-pointer select-none touch-none"
        >
          {showWaveform ? (
            <div className="flex w-full items-center justify-between gap-[2px] h-full">
              {waveformHeights.map((barHeight, idx) => {
                const barProgress = (idx / waveformHeights.length) * 100
                const isPassed = barProgress <= progressPercent
                return (
                  <span
                    key={idx}
                    className={`flex-1 rounded-full transition-colors duration-75 ${
                      isPassed
                        ? 'bg-[#caa24c]'
                        : 'bg-[color:var(--portal-text)]/15'
                    }`}
                    style={{ height: `${barHeight}%`, maxWidth: '3px' }}
                  />
                )
              })}
            </div>
          ) : (
            <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)] overflow-hidden">
              <div className="h-full bg-[#caa24c]" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>

        <span className="shrink-0 tabular-nums text-[11px] font-medium text-[color:var(--portal-muted)]">
          {formatAudioTime(currentTime)} <span className="opacity-45">/</span> {formatAudioTime(duration)}
        </span>

        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
          aria-label={`Playback speed ${PLAYBACK_RATES[rateIndex]}x`}
        >
          {PLAYBACK_RATES[rateIndex]}×
        </button>

        {downloadFilename && (
          <a
            href={src}
            download={downloadFilename}
            className="shrink-0 rounded-md p-1 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] transition-colors"
            aria-label="Download recording"
            title="Download recording"
          >
            <Download size={13} />
          </a>
        )}
      </div>
    )
  }

  // Full / Voicemail Player (iOS Visual Voicemail & Voice Memos style)
  return (
    <div
      className={`rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-4 sm:p-5 ${className}`}
    >
      {sharedAudioElement}

      {(title || subtitle) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            {title && (
              <span className="truncate text-xs font-semibold text-[color:var(--portal-text)]">
                {title}
              </span>
            )}
            {subtitle && (
              <span className="truncate text-xs text-[color:var(--portal-muted)]">
                · {subtitle}
              </span>
            )}
          </div>
          {downloadFilename && (
            <a
              href={src}
              download={downloadFilename}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] transition-colors"
              title="Download audio"
            >
              <Download size={12} /> Save MP3
            </a>
          )}
        </div>
      )}

      {/* Waveform Scrubber */}
      <div
        ref={scrubberRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-label="Audio progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') jumpTime(5)
          if (e.key === 'ArrowLeft') jumpTime(-5)
        }}
        className="relative h-10 w-full flex items-center cursor-pointer select-none touch-none"
      >
        {showWaveform ? (
          <div className="flex w-full items-center justify-between gap-[2px] sm:gap-[3px] h-full">
            {waveformHeights.map((barHeight, idx) => {
              const barProgress = (idx / waveformHeights.length) * 100
              const isPassed = barProgress <= progressPercent
              return (
                <span
                  key={idx}
                  className={`flex-1 rounded-full transition-colors duration-75 ${
                    isPassed
                      ? 'bg-[#caa24c]'
                      : 'bg-[color:var(--portal-text)]/15'
                  }`}
                  style={{ height: `${barHeight}%`, maxWidth: '3.5px' }}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)] overflow-hidden">
            <div className="h-full bg-[#caa24c]" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>

      {/* Elapsed & Remaining Timers */}
      <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums font-medium text-[color:var(--portal-muted)]">
        <span>{formatAudioTime(currentTime)}</span>
        <span>-{formatAudioTime(remainingTime)}</span>
      </div>

      {/* Tactile Transport Controls */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="min-w-[2.75rem] rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[color:var(--portal-text)] transition-transform active:scale-95 hover:border-[#caa24c]/40 cursor-pointer"
          title="Playback speed"
        >
          {PLAYBACK_RATES[rateIndex]}×
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => jumpTime(-15)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--portal-muted)] transition-transform active:scale-90 hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] cursor-pointer"
            aria-label="Skip back 15 seconds"
            title="Back 15s"
          >
            <RotateCcw size={17} />
          </button>

          <button
            type="button"
            onClick={() => void togglePlay()}
            className="luxor-gold-raised flex h-11 w-11 items-center justify-center rounded-full text-white cursor-pointer focus-visible:outline-none"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={18} weight="fill" />
            ) : (
              <Play size={18} weight="fill" className="translate-x-[2px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => jumpTime(15)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--portal-muted)] transition-transform active:scale-90 hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] cursor-pointer"
            aria-label="Skip forward 15 seconds"
            title="Forward 15s"
          >
            <RotateCw size={17} />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--portal-muted)] transition-transform active:scale-95 hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] cursor-pointer"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </div>
    </div>
  )
}
