import type { LuxorMailFolder } from './luxorMailFolders'

export type LuxorMailboxStats = { total: number; inboxCount: number; sentCount: number; campaignCount: number; starredCount: number }
export type LuxorMailboxPageRequest = {
  folder: string; query: string; page: number; pageSize: number; snapshot: string | null; starred: string[]; email?: string
}
export type LuxorMailboxPageResult<T> = {
  messages: T[]; folders: LuxorMailFolder[]; stats: LuxorMailboxStats; folderCounts: Record<string, number>
  snapshot: string; page: number; pageSize: number; total: number
}
