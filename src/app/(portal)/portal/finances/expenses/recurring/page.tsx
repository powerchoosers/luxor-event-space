import { redirect } from 'next/navigation'

export default async function LegacyExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === 'view') continue
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) params.append(key, item)
  }
  params.set('view', 'expense-recurring')
  redirect(`/portal/finances?${params}`)
}
