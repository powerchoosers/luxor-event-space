'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { PortalCloseButton } from '@/components/portal/PortalUI'

export type BrandAssetLightboxAsset = {
  name: string
  url: string
  category?: string
}

export function BrandAssetLightbox({
  asset,
  onClose,
}: {
  asset: BrandAssetLightboxAsset | null
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [scale, setScale] = useState(1)
  const closeViewer = () => {
    setScale(1)
    onClose()
  }

  useEffect(() => {
    if (!asset) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer()
      if (event.key === '+' || event.key === '=') setScale((value) => Math.min(3, value + 0.25))
      if (event.key === '-') setScale((value) => Math.max(1, value - 0.25))
      if (event.key === '0') setScale(1)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [asset, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {asset ? (
        <motion.div
          className="fixed inset-0 z-[9999] bg-[#090806] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeViewer}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${asset.name} image viewer`}
            className="relative flex h-full w-full items-center justify-center overflow-hidden"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/75 to-transparent px-5 py-5 sm:px-8">
              <div className="min-w-0 rounded-lg bg-black/55 px-3 py-2 backdrop-blur-sm">
                <p className="truncate text-sm font-semibold text-white">{asset.name}</p>
                {asset.category ? <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/70">{asset.category}</p> : null}
              </div>
              <PortalCloseButton onClick={closeViewer} aria-label="Close image viewer" className="pointer-events-auto !text-white/75 !opacity-80 hover:!bg-white/10 hover:!text-white hover:!opacity-100 focus-visible:!ring-[#caa24c]/70" />
            </div>

            <motion.img
              src={asset.url}
              alt={asset.name}
              draggable={false}
              onDoubleClick={() => setScale((value) => (value > 1 ? 1 : 2))}
              drag={scale > 1}
              dragConstraints={{ left: -320, right: 320, top: -240, bottom: 240 }}
              animate={{ scale }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
              className={`max-h-[calc(100vh-7rem)] max-w-[calc(100vw-4rem)] select-none object-contain ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
              style={{ transformOrigin: 'center center' }}
            />

            <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/80 bg-white p-1.5 text-zinc-800 shadow-2xl">
              <button type="button" onClick={() => setScale((value) => Math.max(1, value - 0.25))} disabled={scale <= 1} className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35" aria-label="Zoom out">
                <Minus size={14} />
              </button>
              <button type="button" onClick={() => setScale(1)} className="flex min-w-14 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-mono font-semibold text-zinc-800 hover:bg-zinc-100" aria-label="Reset zoom">
                <RotateCcw size={12} /> {Math.round(scale * 100)}%
              </button>
              <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} disabled={scale >= 3} className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35" aria-label="Zoom in">
                <Plus size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    , document.body,
  )
}
