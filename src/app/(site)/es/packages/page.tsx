import type { Metadata } from 'next'
import { PackagesPageContent } from '@/components/packages/PackagesPageContent'
import { buildPublicPackageCards } from '@/lib/luxorPublicPackages'
import { loadPublicPackagesPricingSnapshot } from '@/lib/luxorPublicPackageStartingPricesServer'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Paquetes para eventos | Luxor at Las Palmas Events',
  description: 'Conoce los paquetes Esenciales, Signature y Luxor en Luxor at Las Palmas Events en San Antonio.',
  alternates: { canonical: '/es/packages', languages: { en: '/packages', es: '/es/packages' } },
}

export default async function SpanishPackagesPage() {
  const pricing = await loadPublicPackagesPricingSnapshot()
  const cards = buildPublicPackageCards('es', pricing)
  return <PackagesPageContent locale="es" cards={cards} showCardPrices={pricing.showCardPrices} />
}
