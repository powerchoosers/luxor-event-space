/**
 * Frosted public-site popover shell (pairs with `.luxor-public-glass-popover` in globals.css).
 * Matches the Elena slash-command glass recipe without pulling portal theme tokens.
 * The marketing site is light-only (`body[data-luxor-site]`); do not add OS-dark overrides here.
 */
/** Single stacking layer: backdrop and popover render together; menu is above backdrop inside this shell. */
export const LUXOR_PUBLIC_GLASS_LAYER_Z_INDEX = 10050
export const LUXOR_PUBLIC_GLASS_POPOVER_Z_INDEX = LUXOR_PUBLIC_GLASS_LAYER_Z_INDEX
/** @deprecated Portal menus use {@link LUXOR_PUBLIC_GLASS_LAYER_Z_INDEX} with an inner backdrop. */
export const LUXOR_PUBLIC_GLASS_POPOVER_BACKDROP_Z_INDEX = 9990

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

/** Portal listbox menus — portaled; uses `.portal-select-frosted-popover` in globals (not Elena’s class). */
export const PORTAL_FROSTED_POPOVER_MENU =
  'portal-select-frosted-popover portal-popover-surface portal-scrollbar w-full max-h-[380px] overflow-y-auto overscroll-contain rounded-xl border border-[color:var(--portal-border)] p-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/5'
