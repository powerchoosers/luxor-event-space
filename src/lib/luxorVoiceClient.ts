export type LuxorDialTarget = {
  phoneNumber: string
  contactName?: string | null
  inquiryId?: string | null
}

export function startLuxorBrowserCall(target: LuxorDialTarget) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<LuxorDialTarget>('luxor-start-call', { detail: target }))
}

