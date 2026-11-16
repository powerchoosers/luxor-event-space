export function focusElenaPanelEntry(panel: HTMLElement | null) {
  if (!panel) return
  const focusable = panel.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  const heading = panel.querySelector<HTMLElement>('h3')
  const target = focusable ?? heading
  target?.focus({ preventScroll: true })
}

export function focusElenaLauncher(launcher: HTMLElement | null | undefined) {
  launcher?.focus({ preventScroll: true })
}