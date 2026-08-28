/** Folder placement is independent of whether Luxor sent the message. */
export const luxorMailFolderLabels: Record<string, string> = {
  inbox: 'Inbox', sent: 'Sent & outbox', drafts: 'Drafts', templates: 'Templates',
  spam: 'Spam', trash: 'Trash', outbox: 'Imported outbox',
  retained: 'Retained history',
}

const zohoSystemFolders = {
  inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', templates: 'Templates',
  spam: 'Spam', trash: 'Trash', outbox: 'Outbox',
} as const

type FolderRow = {
  direction: 'incoming' | 'outgoing'; metadata: Record<string, unknown>
}

export type LuxorMailFolder = { folder: string; folderId: string; folderName: string; folderPath: string }

/** The release catalogue includes empty folders, not just folders with recent mail. */
export function luxorMailFolderCatalog(accountId: string, folders: Record<string, unknown>[]): LuxorMailFolder[] {
  return folders.map(zohoFolder => luxorMailFolder({ direction: 'incoming',
    metadata: { source: 'zoho-history-import', zohoAccountId: accountId, zohoFolder } }))
}

export function luxorMailAdditionalFolders(catalog: LuxorMailFolder[], messages: Array<{ folder?: string; folderName?: string }>) {
  const folders = new Map<string, { value: string; label: string; count: number }>()
  for (const entry of catalog) {
    if (!['inbox', 'sent', 'campaigns'].includes(entry.folder)) {
      folders.set(entry.folder, { value: entry.folder, label: entry.folderName, count: 0 })
    }
  }
  for (const message of messages) {
    if (!message.folder || ['inbox', 'sent', 'campaigns'].includes(message.folder)) continue
    const previous = folders.get(message.folder)
    folders.set(message.folder, { value: message.folder,
      label: previous?.label || luxorMailFolderLabels[message.folder] || message.folderName || 'Imported folder',
      count: (previous?.count || 0) + 1 })
  }
  return [...folders.values()].sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value))
}

export function luxorMailFolder(row: FolderRow) {
  if (row.metadata.source !== 'zoho-history-import') {
    const folder = row.direction === 'incoming' ? 'inbox' : 'sent'
    return { folder, folderId: folder, folderName: luxorMailFolderLabels[folder], folderPath: '' }
  }
  const source = row.metadata.zohoFolder as { id?: unknown; path?: unknown; name?: unknown; type?: unknown } | undefined
  const account = row.metadata.zohoAccountId
  if (typeof account !== 'string' || !/^\d+$/.test(account) || typeof source?.id !== 'string' || !/^\d+$/.test(source.id)) {
    throw new Error('An imported message is missing its source folder identity. Review the migration before releasing history.')
  }
  const folderId = `zoho-${account}-${source.id}`
  if (row.metadata.historyMissingFromSource === true) {
    return { folder: 'retained', folderId: 'retained', folderName: luxorMailFolderLabels.retained, folderPath: '' }
  }
  // Zoho also reports custom folders as type Inbox. Only a matching system
  // path AND type identifies a built-in folder; never flatten nested folders.
  const system = Object.entries(zohoSystemFolders).find(([, name]) => source.type === name && source.path === `/${name}`)?.[0]
  const folderPath = typeof source.path === 'string' ? source.path : ''
  return { folder: system || folderId, folderId,
    folderName: system ? luxorMailFolderLabels[system] : folderPath || (typeof source.name === 'string' && source.name) || 'Imported folder',
    folderPath }
}

/** A shared predicate keeps counts, client filtering and the API consistent. */
export function luxorMailMatchesFolder(message: { folder?: string; direction?: string }, folder: string) {
  const actual = message.folder || (message.direction === 'campaign' ? 'campaigns' : message.direction === 'incoming' ? 'inbox' : 'sent')
  return folder === 'all' || actual === folder || (folder === 'sent' && ['outbox', 'campaigns'].includes(actual))
}

export function isLuxorMailFolderFilter(value: string) {
  return ['all', 'campaigns', 'retained', ...Object.keys(zohoSystemFolders)].includes(value) || /^zoho-\d+-\d+$/.test(value)
}

/** Trusted constants and numeric source IDs only; suitable inside PostgREST AND. */
export function luxorMailFolderCondition(folder: string) {
  if (!isLuxorMailFolderFilter(folder)) throw new Error('Invalid mailbox folder.')
  if (folder === 'all') return null
  if (folder === 'retained') return 'and(metadata->>source.eq.zoho-history-import,metadata->>historyMissingFromSource.eq.true)'
  return `and(or(metadata->>historyMissingFromSource.is.null,metadata->>historyMissingFromSource.neq.true),${activeFolderCondition(folder)})`
}

function activeFolderCondition(folder: string) {
  const custom = /^zoho-(\d+)-(\d+)$/.exec(folder)
  if (custom) return `and(metadata->>source.eq.zoho-history-import,metadata->>zohoAccountId.eq.${custom[1]},metadata->zohoFolder->>id.eq.${custom[2]})`
  if (folder === 'campaigns') return 'id.is.null' // Campaigns are stored separately.
  const systemCondition = (key: keyof typeof zohoSystemFolders) => {
    const name = zohoSystemFolders[key]
    return `and(metadata->>source.eq.zoho-history-import,metadata->zohoFolder->>type.eq.${name},metadata->zohoFolder->>path.eq./${name})`
  }
  const system = systemCondition(folder as keyof typeof zohoSystemFolders)
  if (folder !== 'inbox' && folder !== 'sent') return system
  const native = `and(or(metadata->>source.is.null,metadata->>source.neq.zoho-history-import),direction.eq.${folder === 'inbox' ? 'incoming' : 'outgoing'})`
  return `or(${native},${system}${folder === 'sent' ? `,${systemCondition('outbox')}` : ''})`
}
