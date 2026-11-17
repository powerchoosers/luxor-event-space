'use client'

import { useEffect, useState } from 'react'
import { defaultWebsiteContent } from '@/lib/publicWebsiteContent'
import { loadPublicWebsiteContent } from '@/lib/publicWebsiteContentClient'

export function PublicHomeIntroduction() {
  const [content, setContent] = useState(defaultWebsiteContent)
  useEffect(() => {
    let active = true
    void loadPublicWebsiteContent().then((data) => { if (active) setContent(data) })
    return () => { active = false }
  }, [])
  return <>
    <h1 className="mt-5 font-serif text-5xl leading-[0.92] text-[#fffaf3] sm:text-6xl lg:text-7xl">{content.headline === defaultWebsiteContent.headline ? <>A Beautiful Setting for Life’s <span className="italic text-[#f1d27a]">Biggest</span> Moments.</> : content.headline}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#d7c29a]/80 sm:text-lg">{content.introduction}</p>
  </>
}

