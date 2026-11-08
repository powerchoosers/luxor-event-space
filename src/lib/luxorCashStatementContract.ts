/** Evidence contract only: this module does not calculate or publish financial statements. */
export type StatementEvidence =
  | { state: 'missing'; reason: string }
  | { state: 'verified'; evidenceIds: string[] }

export type CashStatementEvidence = {
  basisPolicy: StatementEvidence
  reportingPeriod: StatementEvidence
  openingBalances: StatementEvidence
  accountMappings: StatementEvidence
  postedEntries: StatementEvidence
  sourceCoverage: StatementEvidence
  depositsAndRefunds: StatementEvidence
  processingFees: StatementEvidence
}

export type CashStatementAvailability = {
  status: 'unavailable' | 'requires_accountant_review'
  missing: string[]
  /** No figures are calculated by this contract. */
  figures: null
}

/** Verified evidence must name its source. Even a complete set still needs professional review. */
export function cashStatementAvailability(evidence: CashStatementEvidence): CashStatementAvailability {
  const labels: Record<keyof CashStatementEvidence, string> = {
    basisPolicy: 'Cash-basis policy and effective date', reportingPeriod: 'Reporting period', openingBalances: 'Opening balances and supporting records',
    accountMappings: 'Account classifications and mappings', postedEntries: 'Balanced posted accounting entries', sourceCoverage: 'Historical source coverage',
    depositsAndRefunds: 'Security-deposit and refund treatment', processingFees: 'Processing-fee treatment',
  }
  const missing = (Object.keys(labels) as Array<keyof CashStatementEvidence>).flatMap((key) => {
    const item = evidence[key]
    if (!item || item.state === 'missing') return [`${labels[key]}: ${item?.reason || 'not verified'}`]
    if (!Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0 || item.evidenceIds.some((id) => typeof id !== 'string' || !id.trim())) return [`${labels[key]}: supporting evidence is missing`]
    return []
  })
  return { status: missing.length ? 'unavailable' : 'requires_accountant_review', missing, figures: null }
}
