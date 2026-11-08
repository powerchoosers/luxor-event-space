import { createHash } from 'node:crypto'
import { parseStatementCsv, prepareStatementReview, type StatementColumnChoices } from '@/lib/luxorStatementReview'
import { isAccountingSetupId } from '@/lib/luxorAccountingSetup'

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function prepareStatementImport(input: Record<string, unknown>) {
  if (!isAccountingSetupId(input.account_id)) throw new Error('Choose a confirmed account.')
  if (!validDate(input.period_start) || !validDate(input.period_end) || input.period_start > input.period_end) throw new Error('Choose a valid statement period.')
  if (typeof input.content !== 'string' || !input.content.length || input.content.length > 2_000_000) throw new Error('Choose a CSV file no larger than the supported limit.')
  if (typeof input.filename !== 'string' || !input.filename.trim() || input.filename.trim().length > 150) throw new Error('Choose a valid file name.')
  if (!input.columns || typeof input.columns !== 'object' || Array.isArray(input.columns)) throw new Error('Choose the statement columns.')
  const columns = input.columns as StatementColumnChoices
  const hasHeader = input.has_header
  if (typeof hasHeader !== 'boolean') throw new Error('Specify whether the file has a header.')
  const rows = prepareStatementReview(parseStatementCsv(input.content), columns, hasHeader)
  if (!rows.length || rows.length > 5000) throw new Error('The statement must contain between 1 and 5,000 rows.')
  for (const row of rows) if (row.date && (row.date < input.period_start || row.date > input.period_end)) row.issues.push('Date falls outside the selected statement period.')
  const fileHash = createHash('sha256').update(input.content, 'utf8').digest('hex')
  // Construct the digest from an explicit stable field order and bind every import choice.
  const choices = { date: columns.date, description: columns.description, amount: columns.amount, reference: columns.reference ?? null, positiveMeans: columns.positiveMeans, currency: columns.currency, hasHeader }
  const previewHash = createHash('sha256').update(JSON.stringify({ accountId: input.account_id, periodStart: input.period_start, periodEnd: input.period_end, filename: input.filename.trim(), fileHash, choices })).digest('hex')
  return { accountId: input.account_id, periodStart: input.period_start, periodEnd: input.period_end, filename: input.filename.trim(), fileHash, previewHash, choices, rows }
}
