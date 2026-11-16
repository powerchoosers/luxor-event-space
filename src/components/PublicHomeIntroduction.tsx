'use client'

import { useEffect, useState } from 'react'
import { defaultWebsiteContent, parseWebsiteContent } from '@/lib/publicWebsiteContent'

export function PublicHomeIntroduction() {
  const [content, setContent] = useState(defaultWebsiteContent)
  useEffect(() => {
    fetch('/api/public/content?page=public_actions', { cache: 'no-store' }).then((res) => res.ok ? res.json() : null).then((data) => setContent(parseWebsiteContent(data))).catch(() => {})
  }, [])
  return <>
    <h1 className="mt-5 font-serif text-5xl leading-[0.92] text-[#fffaf3] sm:text-6xl lg:text-7xl">{content.headline === defaultWebsiteContent.headline ? <>A Beautiful Setting for Life’s <span className="italic text-[#f1d27a]">Biggest</span> Moments.</> : content.headline}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#d7c29a]/80 sm:text-lg">{content.introduction}</p>
  </>
}
