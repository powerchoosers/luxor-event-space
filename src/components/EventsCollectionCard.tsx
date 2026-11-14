'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from '@/lib/icons/phosphor-compat'
import { motion, useReducedMotion } from 'framer-motion'
import type { LuxorEventCollection } from '@/lib/luxorEventCollections'

type EventsCollectionCardProps = {
  collection: LuxorEventCollection
  index: number
  title: string
  href: string
}

export function EventsCollectionCard({ collection, index, title, href }: EventsCollectionCardProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.23, 1, 0.32, 1] }}
    >
      <Link
        href={href}
        className="group relative grid overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#fffdf9] transition-[border-color,transform] duration-300 hover:border-[#caa24c]/50 motion-reduce:transition-none sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
      >
        <div className="flex min-h-[11rem] flex-col justify-center px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#8d672b]">
            Collection {collection.number}
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-[1.02] text-[#241d17] transition-colors group-hover:text-[#8d672b] sm:text-4xl">
            {title}
          </h2>
        </div>

        <div className="relative min-h-[17rem] p-3 sm:min-h-[19rem] sm:p-4">
          <div className="relative h-full min-h-[15rem] overflow-hidden rounded-2xl">
            <Image
              src={collection.image}
              alt={collection.imageAlt}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          </div>
        </div>

        <span
          aria-hidden
          className="absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-[#caa24c]/45 bg-[#fffdf9] text-[#241d17] transition duration-300 group-hover:border-[#caa24c]/70 motion-reduce:transition-none sm:bottom-6 sm:right-6"
        >
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </motion.div>
  )
}