export type PortalElenaCloseReason = 'pointer' | 'keyboard' | 'programmatic'

export type PortalElenaCloseController = {
  requestClose: (isOpen: boolean, reason: PortalElenaCloseReason) => boolean
  finishClose: () => void
  shouldIgnoreLauncherActivation: () => boolean
  shouldIgnoreDuplicateCloseClick: () => boolean
  armKeyboardClose: () => void
}

const DEFAULT_LAUNCHER_SUPPRESS_MS = 120

export function createPortalElenaCloseController(
  launcherSuppressMs: number = DEFAULT_LAUNCHER_SUPPRESS_MS,
): PortalElenaCloseController {
  let inFlight = false
  let suppressLauncherUntil = 0
  let keyboardCloseArmed = false

  return {
    requestClose(isOpen, _reason) {
      if (!isOpen || inFlight) return false
      inFlight = true
      return true
    },
    finishClose() {
      inFlight = false
      suppressLauncherUntil = Date.now() + launcherSuppressMs
    },
    shouldIgnoreLauncherActivation() {
      return Date.now() < suppressLauncherUntil
    },
    shouldIgnoreDuplicateCloseClick() {
      if (!keyboardCloseArmed) return false
      keyboardCloseArmed = false
      return true
    },
    armKeyboardClose() {
      keyboardCloseArmed = true
    },
  }
}

export function handleElenaPanelCloseKeyDown(
  event: { key: string; preventDefault: () => void; stopPropagation: () => void },
  onClose: () => void,
  armKeyboardClose: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  armKeyboardClose()
  onClose()
}