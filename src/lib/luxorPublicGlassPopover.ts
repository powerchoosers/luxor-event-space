/**
 * Frosted public-site popover shell (pairs with `.luxor-public-glass-popover` in globals.css).
 * Matches the Elena slash-command glass recipe without pulling portal theme tokens.
 * The marketing site is light-only (`body[data-luxor-site]`); do not add OS-dark overrides here.
 */
export const LUXOR_PUBLIC_GLASS_POPOVER_Z_INDEX = 150

export const LUXOR_PUBLIC_GLASS_POPOVER_SHELL =
  'luxor-public-glass-popover rounded-2xl border border-[#d8c4a4]/80 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/5'

export const LUXOR_PUBLIC_GLASS_POPOVER_SCROLLER =
  `${LUXOR_PUBLIC_GLASS_POPOVER_SHELL} portal-scrollbar portal-scrollbar-light overflow-y-auto overscroll-contain`

export const LUXOR_PUBLIC_GLASS_POPOVER_MENU =
  `${LUXOR_PUBLIC_GLASS_POPOVER_SCROLLER} rounded-xl p-1.5`

export const LUXOR_PUBLIC_GLASS_OPTION_BASE =
  'luxor-public-glass-option flex min-h-11 w-full cursor-pointer items-center rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-[#3b2b1d] transition-colors hover:bg-[#f5efe5] hover:text-[#241d17]'

export const LUXOR_PUBLIC_GLASS_OPTION_SELECTED =
  'border-[#b98a3d]/30 bg-[#f5ead8] font-semibold text-[#6f4d1f]'
