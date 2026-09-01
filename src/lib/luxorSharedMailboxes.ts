export const LUXOR_INVOICES_MAILBOX = {
  key: 'invoices',
  address: 'invoices@luxoratlaspalmas.com',
  label: 'Invoices',
  description: 'Vendor invoices and bills that Luxor needs to pay.',
} as const

export const LUXOR_SHARED_MAILBOXES = [LUXOR_INVOICES_MAILBOX] as const

export type LuxorSharedMailbox = (typeof LUXOR_SHARED_MAILBOXES)[number]

export function findLuxorSharedMailboxByAddress(address: string) {
  const normalized = address.trim().toLowerCase()
  return LUXOR_SHARED_MAILBOXES.find((mailbox) => mailbox.address === normalized) || null
}

