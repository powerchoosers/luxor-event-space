import 'server-only'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorExpenseStorageConfig } from '@/lib/luxorExpensesServer'

export const VENDOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function vendorFinanceSession() {
  const session = await getOperationsSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  return member?.status === 'active' && memberCan(member, 'finances') ? session : null
}
export function vendorDocumentPath(vendorId: string, documentId: string) {
  if (!VENDOR_UUID.test(vendorId) || !VENDOR_UUID.test(documentId)) throw new Error('Invalid document path.')
  return `vendor-documents/${vendorId.toLowerCase()}/${documentId.toLowerCase()}`
}
export async function vendorStorage(path: string, init: RequestInit = {}) {
  const { url, key } = await getLuxorExpenseStorageConfig()
  if (!/^vendor-documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(path)) throw new Error('Invalid document path.')
  return fetch(`${url}/storage/v1/object/luxor-documents/${path.split('/').map(encodeURIComponent).join('/')}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers }, cache: 'no-store' })
}

/** Supabase storage often answers missing objects with HTTP 400, not 404. */
export async function vendorStorageObjectMissing(response: Response) {
  if (response.ok) return false
  if (response.status === 404) return true
  if (response.status === 400) {
    const text = await response.text().catch(() => '')
    return /not found|does not exist|object not found/i.test(text)
  }
  return false
}
