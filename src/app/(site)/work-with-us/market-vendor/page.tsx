import type { Metadata } from 'next'
import Image from 'next/image'
import { ChristmasMarketVendorForm } from '@/components/ChristmasMarketVendorForm'

export const metadata: Metadata = {
  title: 'Christmas Market Vendor Application | Luxor at Las Palmas Events',
  description: 'Apply to be a vendor at the Luxor Christmas Market on Saturday, December 12, 2026.',
}

export default function ChristmasMarketVendorPage() {
  return (
    <main className="bg-[#faf7f1] pt-28 text-[#241d17]">
      <section className="relative isolate min-h-[52svh] overflow-hidden border-b border-[#caa24c]/15 sm:min-h-[60svh]">
        <Image
          src="/images/work-with-us/christmas-market-vendor-bg.jpg"
          alt=""
          fill
          priority
          className="object-cover object-[center_38%]"
          sizes="100vw"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        />
        <div className="relative z-10 mx-auto flex min-h-[52svh] max-w-3xl flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[60svh] sm:px-6 sm:py-16">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] sm:text-[11px] sm:tracking-[0.28em]"
            style={{ color: '#f1d27a', textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}
          >
            Luxor at Las Palmas
          </p>
          <h1
            className="mt-3 font-serif text-4xl leading-tight sm:text-5xl"
            style={{ color: '#fffaf3', textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
          >
            Christmas Market Vendor Application
          </h1>
          <p
            className="mx-auto mt-4 max-w-2xl text-sm leading-6 sm:text-base"
            style={{ color: '#eadcc8', textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}
          >
            Apply to be a vendor at our Christmas Market on Saturday, December 12, 2026.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <ChristmasMarketVendorForm />
      </div>
    </main>
  )
}