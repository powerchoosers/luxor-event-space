type ReportCountRow = { label: string; count: number }

export type LuxorLeadBookingCsvInput = {
  generatedAt: string
  throughMonth: string
  newLeads30Days: number
  bookings30Days: number
  bookedLeadCount: number
  totalLeads: number
  months: Array<{ label: string; inquiries: number; bookings: number }>
  pipeline: ReportCountRow[]
  eventTypes: ReportCountRow[]
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

/** Build the same lead and booking summary shown on the Reports page. */
export function buildLuxorLeadBookingCsv(report: LuxorLeadBookingCsvInput) {
  const rows: string[][] = [
    ['Luxor lead and booking report', ''],
    ['Generated', report.generatedAt],
    ['Window', `Last 6 calendar months through ${report.throughMonth}`],
    [],
    ['Summary', 'Value'],
    ['New leads (last 30 days)', String(report.newLeads30Days)],
    ['Confirmed bookings (last 30 days)', String(report.bookings30Days)],
    ['Leads with a confirmed booking', String(report.bookedLeadCount)],
    ['All recorded leads', String(report.totalLeads)],
    [],
    ['Monthly activity', 'Month', 'Inquiries created', 'Bookings booked'],
    ...report.months.map((month) => ['', month.label, String(month.inquiries), String(month.bookings)]),
    [],
    ['Lead pipeline', 'Status', 'Count'],
    ...report.pipeline.map((row) => ['', row.label, String(row.count)]),
    [],
    ['Confirmed bookings by event type', 'Event type', 'Bookings'],
    ...report.eventTypes.map((row) => ['', row.label, String(row.count)]),
  ]
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

/** Trigger a browser download, keeping the blob URL alive until the click is handled. */
export function downloadLuxorCsv(csv: string, date = new Date()) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `luxor-lead-booking-report-${date.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
