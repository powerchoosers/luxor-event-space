import { getLuxorLenis } from '@/components/SmoothScroll'

export function focusPublicConfirmation(heading: HTMLHeadingElement | null) {
  if (!heading) return

  requestAnimationFrame(() => {
    if (!heading.isConnected) return
    const headerHeight = document.getElementById('shared-header')?.getBoundingClientRect().height ?? 0
    const offset = headerHeight + 16
    heading.focus({ preventScroll: true })
    const lenis = getLuxorLenis()
    if (lenis) lenis.scrollTo(heading, { offset: -offset, immediate: true })
    else window.scrollTo({ top: Math.max(0, window.scrollY + heading.getBoundingClientRect().top - offset), behavior: 'instant' })
  })
}
