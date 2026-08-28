import 'server-only'
import { supabaseRest } from './supabaseRestServer'
import { listLuxorReleasedMailFolders } from './luxorMailboxServer'
import { isLuxorMailFolderFilter, luxorMailFolderLabels } from './luxorMailFolders'
import { decodeHtmlEntities } from './luxorTextUtils'
import type { LuxorZohoMessage } from './zohoMailServer'
import type { LuxorMailboxPageRequest, LuxorMailboxPageResult } from './luxorMailboxPage'

export function parseLuxorMailboxPage(input: unknown): LuxorMailboxPageRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid mailbox request.')
  const v = input as Record<string, unknown>
  if (typeof v.folder !== 'string' || (v.folder !== 'starred' && !isLuxorMailFolderFilter(v.folder))
    || typeof v.query !== 'string' || v.query.length > 200
    || typeof v.page !== 'number' || !Number.isInteger(v.page) || v.page < 1 || v.page > 2147483647
    || typeof v.pageSize !== 'number' || !Number.isInteger(v.pageSize) || v.pageSize < 1 || v.pageSize > 100
    || (v.snapshot !== null && (typeof v.snapshot !== 'string' || !Number.isFinite(Date.parse(v.snapshot))
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v.snapshot)))
    || !Array.isArray(v.starred) || v.starred.length > 10000
    || v.starred.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    || (v.email !== undefined && (typeof v.email !== 'string' || v.email.length > 254))) throw new Error('Invalid mailbox page parameters.')
  return { folder: v.folder, query: v.query.trim(), page: v.page, pageSize: v.pageSize,
    snapshot: v.snapshot as string | null, starred: [...new Set(v.starred as string[])], email: (v.email as string | undefined)?.trim().toLowerCase() }
}

export async function readLuxorMailboxPage(input: LuxorMailboxPageRequest) {
  const [result, released] = await Promise.all([
    supabaseRest<LuxorMailboxPageResult<LuxorZohoMessage>>('rpc/luxor_mailbox_page', {
      method: 'POST', signal: AbortSignal.timeout(30_000), body: JSON.stringify({ p_folder: input.folder, p_query: input.query,
        p_page: input.page, p_size: input.pageSize, p_snapshot: input.snapshot, p_starred: input.starred, p_email: input.email || '' }),
    }),
    listLuxorReleasedMailFolders(),
  ])
  const catalog = new Map([...result.folders, ...released].map(folder => [folder.folder, {
    ...folder, folderId: folder.folderId || folder.folder, folderName: luxorMailFolderLabels[folder.folder] || folder.folderName,
  }]))
  return { ...result, folders: [...catalog.values()], messages: result.messages.map(message => ({ ...message,
    subject: decodeHtmlEntities(message.subject) || '(No subject)', from: decodeHtmlEntities(message.from),
    to: decodeHtmlEntities(message.to), summary: decodeHtmlEntities(message.summary),
    folderName: catalog.get(message.folder || '')?.folderName || message.folderName,
  })) }
}
