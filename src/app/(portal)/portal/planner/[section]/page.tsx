import { notFound } from 'next/navigation'
import { PlannerRoute } from '../_components/PlannerRoute'

const sections = ['events','tasks','meetings','design-library','vendors','files'] as const

export default async function PlannerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section as (typeof sections)[number])) notFound()
  return <PlannerRoute section={section as (typeof sections)[number]}/>
}
