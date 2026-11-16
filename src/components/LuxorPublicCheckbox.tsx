'use client'

import type { ReactNode } from 'react'

/** Matches homepage brochure / packages inquiry consent checkboxes (see LuxorBrochureForm). */
export const LUXOR_PUBLIC_CHECKBOX_INPUT_CLASS =
  'luxor-public-checkbox mt-1 h-4 w-4 shrink-0 rounded border-2 border-[#caa24c]'

/** Matches optional enhancement tiles on the packages configurator. */
export const LUXOR_PUBLIC_CHECKBOX_TILE_INPUT_CLASS =
  'luxor-public-checkbox mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-[#caa24c] cursor-pointer'

export function LuxorPublicCheckboxField({
  id,
  checked,
  onChange,
  children,
  variant = 'consent',
  disabled,
}: {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  variant?: 'consent' | 'tile'
  disabled?: boolean
}) {
  if (variant === 'tile') {
    return (
      <label
        className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-all duration-150 motion-reduce:transition-none ${
          checked
            ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#241d17]'
            : 'border-[#d8c4a4]/80 bg-white text-[#241d17] hover:border-[#caa24c]/60'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className={LUXOR_PUBLIC_CHECKBOX_TILE_INPUT_CLASS}
        />
        <span className="min-w-0 flex-1 font-medium leading-snug">{children}</span>
      </label>
    )
  }

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg p-1 text-sm text-[#33291f]">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className={LUXOR_PUBLIC_CHECKBOX_INPUT_CLASS}
      />
      <span className="leading-6">{children}</span>
    </label>
  )
}