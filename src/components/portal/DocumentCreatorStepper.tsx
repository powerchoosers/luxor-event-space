'use client'

export type DocumentCreatorStep = 'create' | 'fields' | 'send'

const STEPS: Array<{ id: DocumentCreatorStep; number: number; label: string }> = [
  { id: 'create', number: 1, label: 'Create' },
  { id: 'fields', number: 2, label: 'Fields' },
  { id: 'send', number: 3, label: 'Send' },
]

export function DocumentCreatorStepper({
  activeStep = 'create',
  onStepChange,
  fieldsEnabled = false,
}: {
  activeStep?: DocumentCreatorStep
  onStepChange?: (step: DocumentCreatorStep) => void
  fieldsEnabled?: boolean
}) {
  return (
    <nav aria-label="Document steps" className="min-w-0">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step) => {
          const current = step.id === activeStep
          const disabled = step.id === 'send' || (step.id === 'fields' && !fieldsEnabled)
          return (
            <li key={step.id} className="flex min-w-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onStepChange?.(step.id)
                }}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold sm:min-h-10 sm:px-3 sm:text-xs ${
                  current
                    ? 'text-[#caa24c]'
                    : disabled
                      ? 'cursor-default text-[color:var(--portal-faint)]'
                      : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
                aria-current={current ? 'step' : undefined}
                aria-disabled={disabled || undefined}
              >
                <span className="tabular-nums">{step.number}</span>
                <span className="truncate">{step.label}</span>
              </button>
              {step.number < STEPS.length ? (
                <span className="hidden text-[10px] text-[color:var(--portal-faint)] sm:inline" aria-hidden>
                  /
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}