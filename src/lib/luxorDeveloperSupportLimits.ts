/** Owner developer support ticket field limits (shared by portal UI and server validation). */
export const LUXOR_DEVELOPER_SUPPORT_TITLE_MAX = 200
export const LUXOR_DEVELOPER_SUPPORT_DESCRIPTION_MAX = 20_000

export function developerSupportDescriptionLimitMessage(): string {
  const limit = LUXOR_DEVELOPER_SUPPORT_DESCRIPTION_MAX.toLocaleString('en-US')
  return `Shorten the extra details to ${limit} characters or less.`
}
