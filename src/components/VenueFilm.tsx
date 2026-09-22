'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'

type NativeFullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

export function VenueFilm({ autoPlay = false, headline, hero = false, children }: { autoPlay?: boolean; headline?: string; hero?: boolean; children?: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const fullscreenRef = useRef(false)
  const userPaused = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const sync = () => {
      if (fullscreenRef.current) return
      if (!visible || document.hidden) video.pause()
      else if (autoPlay && !motion.matches && !userPaused.current) void video.play().catch(() => {})
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    }, { threshold: 0.2 })
    observer.observe(video)
    const onMotionChange = () => {
      if (motion.matches) video.pause()
      else sync()
    }
    const updateFullscreen = (active: boolean) => {
      fullscreenRef.current = active
      setFullscreen(active)
      video.controls = !autoPlay || active
      if (!active) userPaused.current = video.paused
    }
    const onFullscreenChange = () => updateFullscreen(document.fullscreenElement === video)
    const onNativeBegin = () => updateFullscreen(true)
    const onNativeEnd = () => updateFullscreen(false)
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    video.addEventListener('webkitbeginfullscreen', onNativeBegin)
    video.addEventListener('webkitendfullscreen', onNativeEnd)
    motion.addEventListener('change', onMotionChange)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      video.removeEventListener('webkitbeginfullscreen', onNativeBegin)
      video.removeEventListener('webkitendfullscreen', onNativeEnd)
      motion.removeEventListener('change', onMotionChange)
      video.pause()
    }
  }, [autoPlay])

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      userPaused.current = false
      try { await video.play() } catch { setFailed(true) }
    } else {
      userPaused.current = true
      video.pause()
    }
  }

  async function enterFullscreen() {
    const video = videoRef.current as NativeFullscreenVideo | null
    if (!video) return
    setFullscreenError(false)
    // Fullscreen the video itself, never the wrapper containing website content.
    video.controls = true
    try {
      if (video.webkitEnterFullscreen) video.webkitEnterFullscreen()
      else if (video.requestFullscreen) await video.requestFullscreen()
      else throw new Error('Native fullscreen is unavailable')
    } catch {
      video.controls = !autoPlay
      setFullscreenError(true)
    }
  }

  return (
    <div className={`venue-film${headline || hero ? ' venue-film--hero' : ''}`} data-fullscreen={fullscreen || undefined}>
      <video
        ref={videoRef}
        poster="/videos/luxor-venue-poster.jpg"
        muted={muted}
        playsInline
        loop={autoPlay}
        controls={!autoPlay || fullscreen}
        preload={autoPlay ? 'metadata' : 'none'}
        aria-label="A film of Luxor at Las Palmas event space"
        onPlay={() => { setPlaying(true); setFailed(false) }}
        onPause={() => setPlaying(false)}
        onVolumeChange={() => setMuted(videoRef.current?.muted ?? true)}
        onError={() => setFailed(true)}
      >
        <source src="/videos/luxor-venue-mobile.mp4" media="(max-width: 900px)" type="video/mp4" />
        <source src="/videos/luxor-venue.mp4" type="video/mp4" />
      </video>
      {headline ? <div className="venue-film-heading"><h1>{headline}</h1></div> : null}
      {children}
      {autoPlay ? <div className="venue-film-controls">
        <span className="venue-film-caption">Inside Luxor <span> /  The venue film</span></span>
        <div className="venue-film-buttons">
          <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause venue film' : 'Play venue film'}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute venue film' : 'Mute venue film'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{muted ? 'Sound off' : 'Sound on'}</span></button>
          <button type="button" aria-label="View venue film fullscreen" onClick={enterFullscreen}><Maximize2 size={17} /></button>
        </div>
      </div> : null}
      {failed ? <p className="venue-film-error" role="status">The film couldn’t load. <a href="/videos/luxor-venue.mp4">Open the video</a></p> : null}
      {fullscreenError ? <p className="venue-film-error" role="status">Fullscreen isn’t available here. <a href="/videos/luxor-venue.mp4">Open the video player</a></p> : null}
    </div>
  )
}
