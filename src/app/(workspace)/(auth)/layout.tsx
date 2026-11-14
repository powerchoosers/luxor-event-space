import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PortalAuthArrival } from '@/components/portal/PortalLoginHandoff'

export const metadata: Metadata = { title: 'Luxor | Owner Portal Login' }
export default function AuthLayout({ children }: { children: ReactNode }) { return <PortalAuthArrival>{children}</PortalAuthArrival> }
