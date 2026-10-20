import type { LuxorSavedPaymentSchedule } from '@/lib/luxorSavedPaymentSchedule'

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function date(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))))
}

export function SavedPaymentSchedule({ schedule, tone = 'dark' }: { schedule: LuxorSavedPaymentSchedule; tone?: 'dark' | 'light' }) {
  if (!schedule) return null
  const dark = tone === 'dark'
  const border = dark ? 'border-white/10 bg-white/[0.025]' : 'border-[#ded5c8] bg-[#faf7f2]'
  const heading = dark ? 'text-[#f1d27a]' : 'text-[#8c6529]'
  const copy = dark ? 'text-zinc-400' : 'text-[#6f665b]'
  const text = dark ? 'text-zinc-200' : 'text-[#2d251e]'
  const muted = dark ? 'text-zinc-500' : 'text-[#84796c]'
  const note = schedule.status === 'preview'
    ? 'Preview only. Actual payment dates begin on the first confirmed booking payment.'
    : schedule.status === 'committed'
      ? 'Dates and amounts shown are from the saved payment schedule.'
      : schedule.status === 'review_required'
        ? 'The confirmed booking payment is too close to the existing final-payment deadline for the standard schedule. Luxor must review the payment schedule.'
        : 'Payment dates and amounts saved with this proposal.'

  return <section aria-label="Saved payment schedule" className={`mt-6 overflow-hidden rounded-2xl border ${border}`}>
    <div className={`border-b ${dark ? 'border-white/10' : 'border-[#ded5c8]'} px-5 py-4`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${heading}`}>Payment schedule</p>
      <p className={`mt-1 text-xs leading-5 ${copy}`}>{note}</p>
    </div>
    {schedule.rows.length ? <ol className={`divide-y ${dark ? 'divide-white/[0.07]' : 'divide-[#ded5c8]'}`}>
      {schedule.rows.map((row) => <li key={row.installment_order} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className={`text-sm font-semibold ${text}`}>{row.label}</p>
          <p className={`mt-0.5 text-xs ${muted}`}>{date(row.due_at)}{row.status === 'paid' ? ' · Paid' : row.status === 'partial' ? ' · Partially paid' : ''}</p>
          {row.description ? <p className={`mt-0.5 text-[11px] leading-4 ${copy}`}>{row.description}</p> : null}
        </div>
        <p className={`font-mono text-sm font-bold ${heading}`}>{money(row.amount)}</p>
      </li>)}
    </ol> : null}
    {schedule.final_payment_due_date ? <p className={`border-t ${dark ? 'border-white/10' : 'border-[#ded5c8]'} px-5 py-3 text-xs ${copy}`}>Final-payment deadline: {date(schedule.final_payment_due_date)}</p> : null}
  </section>
}
