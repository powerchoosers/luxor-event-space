import type { Metadata } from 'next'
import { PackagesPageContent } from '@/components/packages/PackagesPageContent'

export const metadata: Metadata = {
  title: 'Paquetes para eventos | Luxor at Las Palmas Events',
  description: 'Conoce los paquetes Esenciales, Signature y Luxor en Luxor at Las Palmas Events en San Antonio.',
  alternates: { canonical: '/es/packages', languages: { en: '/packages', es: '/es/packages' } },
}

export default function SpanishPackagesPage() {
  return <PackagesPageContent locale="es" />
}
