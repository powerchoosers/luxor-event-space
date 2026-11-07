import 'server-only'

import { getLuxorExpenseStorageConfig } from '@/lib/luxorExpensesServer'

export const LUXOR_EXPENSE_RECEIPT_MAX_BYTES = 20 * 1024 * 1024
export type LuxorExpenseReceiptMime = 'application/pdf' | 'image/jpeg' | 'image/png'

function safeFileName(value: string) {
  const basename = value.split(/[\\/]/).pop() || 'receipt'
  const cleaned = basename.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/[ ]+/g, '_').slice(0, 120)
  return cleaned || 'receipt'
}

export async function inspectLuxorExpenseReceipt(file: File) {
  if (file.size < 1 || file.size > LUXOR_EXPENSE_RECEIPT_MAX_BYTES) throw new Error('Choose a receipt smaller than 20 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value)
  let contentType: LuxorExpenseReceiptMime | null = null
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') contentType = 'application/pdf'
  else if (starts([0xff, 0xd8, 0xff])) contentType = 'image/jpeg'
  else if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) contentType = 'image/png'
  if (!contentType) throw new Error('Upload a valid JPG, PNG, or PDF receipt.')
  const ext = file.name.toLowerCase().split('.').pop()
  if ((contentType === 'application/pdf' && ext !== 'pdf')
    || (contentType === 'image/png' && ext !== 'png')
    || (contentType === 'image/jpeg' && !['jpg','jpeg'].includes(ext || ''))) {
    throw new Error('The receipt file extension does not match its contents.')
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  return { bytes, contentType, sha256, safeName: safeFileName(file.name) }
}

export async function uploadLuxorExpenseReceipt(bytes: Uint8Array, contentType: LuxorExpenseReceiptMime, fileName: string) {
  const { url, key } = await getLuxorExpenseStorageConfig()
  const path = `expense-receipts/${crypto.randomUUID()}/${safeFileName(fileName)}`
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: Buffer.from(bytes),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not save the receipt: ${await response.text()}`)
  return path
}

export async function downloadLuxorExpenseReceipt(storagePath: string) {
  if (!storagePath.startsWith('expense-receipts/') || storagePath.includes('..')) throw new Error('Receipt path is invalid.')
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not open the saved receipt: ${await response.text()}`)
  return response
}

export async function removeLuxorExpenseReceiptObject(storagePath: string) {
  if (!storagePath.startsWith('expense-receipts/') || storagePath.includes('..')) return
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
  }).catch(() => undefined)
}
