'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useId, useState } from 'react'

type FaqItem = {
  question: string
  answer: string
}

type PublicFaqListProps = {
  items: FaqItem[]
}

export function PublicFaqList({ items }: PublicFaqListProps) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null)
  const id = useId()

  return (
    <div className="divide-y divide-[#caa24c]/18 border-y border-[#caa24c]/18">
      {items.map((item, index) => {
        const isOpen = openQuestion === item.question
        const answerId = `${id}-answer-${index}`

        return (
          <div key={item.question} className="py-5">
            <button
              type="button"
              aria-controls={answerId}
              aria-expanded={isOpen}
              onClick={() => setOpenQuestion(isOpen ? null : item.question)}
              className="flex w-full cursor-pointer items-center justify-between gap-5 text-left font-serif text-xl leading-7 text-[#f7efe3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f1d27a]"
            >
              <span>{item.question}</span>
              <span className="faq-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#caa24c] transition-transform" style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
                <Plus aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={answerId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pt-4 text-sm leading-7 text-[#d7c29a]/68 sm:text-base">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
