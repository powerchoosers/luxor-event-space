'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'

export function VenueFilm({ autoPlay = false }: { autoPlay?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)
  const userPaused = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const sync = () => {
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
    const onFullscreenChange = () => { video.controls = !autoPlay || document.fullscreenElement === video }
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    motion.addEventListener('change', onMotionChange)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
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

  return (
    <div className="venue-film">
      <video
        ref={videoRef}
        poster="/videos/luxor-venue-poster.jpg"
        muted={muted}
        playsInline
        loop={autoPlay}
        controls={!autoPlay}
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
      {autoPlay ? <div className="venue-film-controls">
        <span className="venue-film-caption">Inside Luxor <span> /  The venue film</span></span>
        <div className="venue-film-buttons">
          <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause venue film' : 'Play venue film'}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute venue film' : 'Mute venue film'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{muted ? 'Sound off' : 'Sound on'}</span></button>
          <button type="button" aria-label="View venue film fullscreen" onClick={() => {
            const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
            if (video?.requestFullscreen) void video.requestFullscreen().catch(() => {})
            else video?.webkitEnterFullscreen?.()
          }}><Maximize2 size={17} /></button>
        </div>
      </div> : null}
      {failed ? <p className="venue-film-error" role="status">The film couldn’t load. <a href="/videos/luxor-venue.mp4">Open the video</a></p> : null}
    </div>
  )
}
