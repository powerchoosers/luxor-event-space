'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building, Handshake, Megaphone, Palette, Sparkles, Users } from '@/lib/icons/phosphor-compat'
import type { WorkWithUsOpportunity } from '@/lib/luxorWorkWithUsContent'

const iconMap = {
  store: Building,
  handshake: Handshake,
  users: Users,
  palette: Palette,
  gift: Megaphone,
  sparkles: Sparkles,
}

export function WorkWithUsOpportunityCard({ opportunity }: { opportunity: WorkWithUsOpportunity }) {
  const Icon = iconMap[opportunity.iconName]

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#caa24c]/28 bg-[#fffdf9] shadow-sm transition hover:border-[#caa24c]/45 hover:shadow-md motion-reduce:transition-none">
      <div className="relative h-44 sm:h-48">
        <Image
          src={opportunity.image}
          alt={opportunity.imageAlt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-center translate-y-1/2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#caa24c]/35 bg-[#fffdf9] text-[#9a712e] shadow-sm">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-10 text-center">
        <h2 className="font-serif text-xl uppercase tracking-[0.08em] text-[#241d17] sm:text-2xl">
          {opportunity.title}
        </h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-[#665a4e]">{opportunity.description}</p>
        <Link
          href={opportunity.href}
          className="luxor-gold-raised mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em]"
        >
          {opportunity.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}