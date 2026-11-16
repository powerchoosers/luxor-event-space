import 'server-only'

import { getLuxorExpenseStorageConfig } from '@/lib/luxorExpensesServer'

export const LUXOR_PARTNER_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const LUXOR_PARTNER_PHOTO_MIN_COUNT = 2
export const LUXOR_PARTNER_PHOTO_MAX_COUNT = 4

export type LuxorPartnerPhotoMime = 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif'

function safeFileName(value: string) {
  const basename = value.split(/[\\/]/).pop() || 'photo'
  const cleaned = basename.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/[ ]+/g, '_').slice(0, 120)
  return cleaned || 'photo'
}

function detectHeicOrHeif(bytes: Uint8Array) {
  if (bytes.length < 12) return null
  const brand = new TextDecoder().decode(bytes.slice(4, 12))
  if (/ftypheic|ftypheix|ftyphevc|ftypmif1/i.test(brand)) return 'image/heic' as const
  if (/ftypheif/i.test(brand)) return 'image/heif' as const
  return null
}

export async function inspectLuxorPartnerApplicationPhoto(file: File) {
  if (file.size < 1 || file.size > LUXOR_PARTNER_PHOTO_MAX_BYTES) {
    throw new Error('Choose a photo smaller than 10 MB.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value)
  let contentType: LuxorPartnerPhotoMime | null = null
  if (starts([0xff, 0xd8, 0xff])) contentType = 'image/jpeg'
  else if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) contentType = 'image/png'
  else contentType = detectHeicOrHeif(bytes)
  if (!contentType) throw new Error('Upload valid PNG, JPG, or HEIC photos.')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  return { bytes, contentType, sha256, safeName: safeFileName(file.name) }
}

export function luxorPartnerApplicationPhotoPath(applicationId: string, fileId: string, safeName: string) {
  const id = applicationId.toLowerCase()
  const fid = fileId.toLowerCase()
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(fid)) throw new Error('Invalid photo path.')
  return `partner-applications/${id}/${fid}/${safeName}`
}

export async function uploadLuxorPartnerApplicationPhoto(
  storagePath: string,
  bytes: Uint8Array,
  contentType: LuxorPartnerPhotoMime,
) {
  if (!storagePath.startsWith('partner-applications/') || storagePath.includes('..')) {
    throw new Error('Photo path is invalid.')
  }
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: Buffer.from(bytes),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not save the photo: ${await response.text()}`)
}

export async function createLuxorPartnerApplicationSignedPhotoUrl(storagePath: string, fileName: string) {
  if (!storagePath.startsWith('partner-applications/') || storagePath.includes('..')) {
    throw new Error('Photo path is invalid.')
  }
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(
    `${url}/storage/v1/object/sign/luxor-documents/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 120, download: fileName }),
      cache: 'no-store',
    },
  )
  if (!response.ok) throw new Error('Photo link is unavailable.')
  const json = (await response.json()) as { signedURL?: string }
  if (!json.signedURL) throw new Error('Photo link is unavailable.')
  return json.signedURL.startsWith('http') ? json.signedURL : `${url}/storage/v1${json.signedURL}`
}

export async function removeLuxorPartnerApplicationPhoto(storagePath: string) {
  if (!storagePath.startsWith('partner-applications/') || storagePath.includes('..')) return
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  }).catch(() => undefined)
}