export const SIGNER_OVERLAY_IOS_SAFE_FONT_PX = 16

export function signerOverlayInputPresentation(fittedPx: number) {
  const fitted = Math.min(SIGNER_OVERLAY_IOS_SAFE_FONT_PX, Math.max(6, fittedPx))
  const scale = Math.round((fitted / SIGNER_OVERLAY_IOS_SAFE_FONT_PX) * 1000) / 1000
  const scaled = scale < 0.999
  return {
    fontSize: `${SIGNER_OVERLAY_IOS_SAFE_FONT_PX}px`,
    transform: scaled ? `scale(${scale})` : 'none',
    transformOrigin: 'left center' as const,
    width: scaled ? `${100 / scale}%` : '100%',
    height: scaled ? `${100 / scale}%` : '100%',
  }
}

export function resetSignerPageZoom() {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!(meta instanceof HTMLMetaElement)) return
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
  requestAnimationFrame(() => {
    meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
  })
}
