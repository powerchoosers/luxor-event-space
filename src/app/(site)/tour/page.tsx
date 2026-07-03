'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, ArrowLeft, Play, CalendarPlus, ClipboardCheck } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { LuxorInquiryForm } from '@/components/LuxorInquiryForm'
import Link from 'next/link'
import Image from 'next/image'

export default function VirtualTourPage() {
  const [bookingOpen, setBookingOpen] = useState(false)

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pt-24 text-[#f8f3ed]">
      <div className="absolute inset-0 luxor-noise opacity-30 pointer-events-none" />
      
      {/* Hero Section */}
      <section className="relative px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div>
            <div className="flex items-center gap-4 mb-8">
              <Link href="/" className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors uppercase tracking-[0.3em] font-mono text-[10px]">
                <ArrowLeft className="h-4 w-4" />
                Return to home
              </Link>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            
            <LuxorAxisLockup className="mx-auto mb-8 w-full max-w-[360px] sm:max-w-[460px]" />
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.42em] text-[#caa24c]">Experience Luxor</p>
            <h1 className="mx-auto mt-5 max-w-4xl text-center font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              Virtual 4K Walkthrough
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-center text-base leading-7 text-white/70 sm:text-lg">
              Every detail of Luxor is built for the frame. Use the interactive tour below to see how families celebrate, how tables flow, and how the light works at every angle of the room.
            </p>
          </div>

          {/* Virtual Tour Player */}
          <Reveal delay={200} className="mt-14">
            <div className="luxor-deco-frame group relative mx-auto aspect-video w-full max-w-6xl overflow-hidden border border-[#caa24c]/25 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
              <Image
                src="/tour-header.png" 
                alt="Virtual tour environment" 
                fill
                priority
                sizes="(min-width: 1024px) 1152px, 100vw"
                className="object-cover transition-transform duration-1000 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors duration-500" />
              
              {/* Play / Interactive UI */}
              <div className="absolute inset-0 flex items-center justify-center">
                 <motion.button 
                   whileHover={{ scale: 1.1, backgroundColor: '#c8a669' }}
                   whileTap={{ scale: 0.95 }}
                   className="flex h-20 w-20 items-center justify-center border border-[#f1d27a]/40 bg-[#caa24c] text-black shadow-2xl"
                 >
                   <Play className="h-8 w-8 ml-1" fill="black" />
                 </motion.button>
              </div>

              {/* Lower Overlay */}
              <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-6 bg-gradient-to-t from-black/80 to-transparent">
                 <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center border border-[#caa24c]/35 bg-black/45 text-[#f1d27a] backdrop-blur-md">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-white/80 font-mono tracking-wider">Tour requests go straight to the Luxor CRM</p>
                 </div>
                 
                 <div className="flex gap-2">
                    <span className="border border-[#caa24c]/25 bg-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80 backdrop-blur-md">4K Rendered</span>
                    <span className="border border-[#caa24c]/30 bg-[#caa24c]/18 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f1d27a] backdrop-blur-md">Interactive</span>
                 </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Booking CTA Section */}
      <section className="relative isolate overflow-hidden bg-[#120d0c] py-28 text-[#f8f3ed]">
         <div className="absolute inset-0 luxor-noise opacity-5 pointer-events-none" />
         <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
               <Reveal>
                  <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#caa24c]">In-Person Experience</p>
                  <h2 className="mt-5 font-serif text-5xl leading-[0.9] sm:text-6xl">
                    Like the tour? <br />
                    See it in person.
                  </h2>
                  <p className="mt-8 text-lg leading-8 text-[#d7c29a]/72">
                    Digital renders don&apos;t capture the echo or the exact tone of the lighting. Schedule a private walkthrough to feel the room&apos;s energy and start mapping your event floor plan.
                  </p>
                  
                  <div className="mt-10 space-y-4">
                     {[
                        'Private 45-minute walkthrough',
                        'Consultation on custom layouts',
                        'Date availability verification',
                        'Pricing & package confirmation'
                     ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                           <div className="flex h-5 w-5 items-center justify-center bg-[#caa24c] text-[#050505]">
                              <Check className="h-3 w-3" />
                           </div>
                           <span className="text-sm font-semibold uppercase tracking-wider text-[#f8f3ed]">{item}</span>
                        </div>
                     ))}
                  </div>

                  <motion.button 
                    onClick={() => setBookingOpen(true)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group mt-12 inline-flex items-center gap-3 border border-[#f1d27a]/40 bg-[#caa24c] px-8 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-2xl transition-transform"
                  >
                    Select an appointment
                    <CalendarPlus className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                  </motion.button>
               </Reveal>

               <Reveal delay={200}>
                  <div className="luxor-deco-frame group relative h-[500px] overflow-hidden border border-[#caa24c]/25 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
                     <Image
                       src="/spaces-hero.png" 
                       alt="Luxor event space walkthrough" 
                       fill
                       sizes="(min-width: 1024px) 45vw, 100vw"
                       className="object-cover transition-transform duration-1000 group-hover:scale-105"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                     <div className="absolute bottom-8 left-8 right-8">
                        <div className="border border-[#caa24c]/25 bg-black/45 p-6 text-white backdrop-blur-xl">
                           <p className="font-serif text-2xl leading-tight">Use the request form to send your event details, preferred tour date, and contact info into the CRM.</p>
                           <p className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-80">Coordinator confirms final availability</p>
                        </div>
                     </div>
                  </div>
               </Reveal>
            </div>
         </div>
      </section>

      {/* Booking Modal */}
      <AnimatePresence>
        {bookingOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBookingOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative flex w-full max-w-4xl flex-col overflow-hidden border border-[#caa24c]/28 bg-[#0a0807] text-[#f8f3ed] shadow-2xl lg:flex-row"
            >
              <div className="flex-1 border-b border-[#caa24c]/18 p-8 lg:border-b-0 lg:border-r lg:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#caa24c]">Real inquiry flow</p>
                    <h3 className="font-serif text-3xl">Request a private tour</h3>
                  </div>
                  <button 
                    onClick={() => setBookingOpen(false)}
                    className="p-3 transition-colors hover:bg-white/5"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-5 text-sm leading-7 text-[#d7c29a]/72">
                  <p>
                    This no longer pretends to be a live availability calendar. Visitors can request the date and time that works for them, and Luxor can confirm the real schedule from the CRM.
                  </p>
                  {[
                    'Creates a lead in the CRM immediately',
                    'Stores preferred tour date and time',
                    'Keeps event type, guest count, package interest, and notes together',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 border-t border-[#caa24c]/16 pt-4">
                      <Check className="h-4 w-4 shrink-0 text-[#caa24c]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Form */}
              <div className="w-full bg-[#050505] p-5 lg:w-[430px] lg:p-6">
                <LuxorInquiryForm
                  source="tour_page_modal"
                  showTourFields
                  compact
                  title="Send your tour request."
                  submitLabel="Send tour request"
                  onSubmitted={() => window.setTimeout(() => setBookingOpen(false), 1800)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </main>
  )
}
