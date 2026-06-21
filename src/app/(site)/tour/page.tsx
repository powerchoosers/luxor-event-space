'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Clock, User, Mail, Phone, MessageSquare, Check, X, ArrowLeft, Play, CalendarPlus } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import Link from 'next/link'

export default function VirtualTourPage() {
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Mock calendar dates (1-30)
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  const firstAvailableDay = 22

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => {
      setBookingOpen(false)
      setSubmitted(false)
    }, 2000)
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pt-24 text-[#f8f3ed]">
      <div className="absolute inset-0 luxor-noise opacity-30 pointer-events-none" />
      
      {/* Hero Section */}
      <section className="relative px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="flex items-center gap-4 mb-8">
              <Link href="/" className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors uppercase tracking-[0.3em] font-mono text-[10px]">
                <ArrowLeft className="h-4 w-4" />
                Return to home
              </Link>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            
            <LuxorWordmark className="mb-7 max-w-[560px]" />
            <div className="luxor-deco-divider mb-8 max-w-md"><span className="luxor-diamond" /></div>
            <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#caa24c]">Experience Luxor</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              Virtual 4K Walkthrough
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Every detail of Luxor is built for the frame. Use the interactive tour below to see how families celebrate, how tables flow, and how the light works at every angle of the room.
            </p>
          </Reveal>

          {/* Virtual Tour Player */}
          <Reveal delay={200} className="mt-14">
            <div className="luxor-deco-frame group relative mx-auto aspect-video w-full max-w-6xl overflow-hidden border border-[#caa24c]/25 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
              <img 
                src="/tour-header.png" 
                alt="Virtual tour environment" 
                className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-1000"
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
                    <div className="flex -space-x-3">
                       {[1,2,3].map(i => (
                          <div key={i} className="h-10 w-10 rounded-full border-2 border-[#100b0d] bg-white/10 overflow-hidden">
                             <img src={`https://i.pravatar.cc/100?u=${i+10}`} alt="user" className="h-full w-full object-cover" />
                          </div>
                       ))}
                    </div>
                    <p className="text-sm text-white/80 font-mono tracking-wider"><span className="text-[#caa24c]">482</span> people viewed this week</p>
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
                     <img 
                       src="/spaces-hero.png" 
                       alt="Luxor event space walkthrough" 
                       className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-1000"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                     <div className="absolute bottom-8 left-8 right-8">
                        <div className="border border-[#caa24c]/25 bg-black/45 p-6 text-white backdrop-blur-xl">
                           <p className="font-serif text-2xl leading-tight italic">&ldquo;The room looked great in the video, but being here made us realize how much space we actually have for the dance floor.&rdquo;</p>
                           <p className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-80">— Local Couple (San Antonio)</p>
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
              {/* Left Side: Calendar */}
              <div className="flex-1 border-b border-[#caa24c]/18 p-8 lg:border-b-0 lg:border-r lg:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#caa24c]">Schedule</p>
                    <h3 className="font-serif text-3xl">Pick a date</h3>
                  </div>
                  <button 
                    onClick={() => setBookingOpen(false)}
                    className="p-3 transition-colors hover:bg-white/5"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} className="mb-2 text-center font-mono text-[10px] font-bold text-[#d7c29a]/35">{d}</div>
                  ))}
                  {days.map(day => {
                    const isToday = day === firstAvailableDay
                    const isSelected = day === selectedDate
                    const isFuture = day >= firstAvailableDay
                    
                    return (
                      <button 
                        key={day}
                        disabled={!isFuture}
                        onClick={() => setSelectedDate(day)}
                        className={`h-10 sm:h-12 flex items-center justify-center rounded-2xl text-sm font-semibold transition-all
                          ${isSelected ? 'bg-[#caa24c] text-[#050505]' : ''}
                          ${isToday && !isSelected ? 'border-2 border-[#caa24c] text-[#caa24c]' : ''}
                          ${isFuture && !isSelected && !isToday ? 'hover:bg-white/5 text-[#f8f3ed]' : ''}
                          ${!isFuture ? 'opacity-20 cursor-not-allowed' : ''}
                        `}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
                
                <div className="mt-8 flex gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#d7c29a]/50">
                    <div className="h-3 w-3 border border-[#caa24c]" />
                    First available
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#d7c29a]/50">
                    <div className="h-3 w-3 bg-[#caa24c]" />
                    Selected
                  </div>
                </div>
              </div>

              {/* Right Side: Form */}
              <div className="w-full bg-[#050505] p-8 lg:w-[380px] lg:p-10">
                <AnimatePresence mode="wait">
                  {!submitted ? (
                    <motion.form 
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={handleSubmit} 
                      className="space-y-6"
                    >
                      <div className="space-y-4 mb-4">
                        <div className="flex items-center gap-3 text-sm text-[#9b7b42] font-mono uppercase tracking-widest">
                          <Calendar className="h-4 w-4" />
                          Selected day {selectedDate || firstAvailableDay}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-[#9b7b42] font-mono uppercase tracking-widest">
                          <Clock className="h-4 w-4" />
                          10:00 AM to 10:45 AM
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/65" />
                          <input 
                            required
                            type="text" 
                            placeholder="Full Name" 
                            className="w-full border border-[#caa24c]/22 bg-black/35 py-3 pl-11 pr-4 text-sm text-[#f8f3ed] focus:outline-none focus:ring-1 focus:ring-[#caa24c]"
                          />
                        </div>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/65" />
                          <input 
                            required
                            type="email" 
                            placeholder="Email Address" 
                            className="w-full border border-[#caa24c]/22 bg-black/35 py-3 pl-11 pr-4 text-sm text-[#f8f3ed] focus:outline-none focus:ring-1 focus:ring-[#caa24c]"
                          />
                        </div>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/65" />
                          <input 
                            required
                            type="tel" 
                            placeholder="Phone Number" 
                            className="w-full border border-[#caa24c]/22 bg-black/35 py-3 pl-11 pr-4 text-sm text-[#f8f3ed] focus:outline-none focus:ring-1 focus:ring-[#caa24c]"
                          />
                        </div>
                        <div className="relative">
                          <MessageSquare className="absolute left-4 top-4 h-4 w-4 text-[#caa24c]/65" />
                          <textarea 
                            placeholder="Specific event details..." 
                            className="h-32 w-full resize-none border border-[#caa24c]/22 bg-black/35 py-4 pl-11 pr-4 text-sm text-[#f8f3ed] focus:outline-none focus:ring-1 focus:ring-[#caa24c]"
                          />
                        </div>
                      </div>

                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="w-full border border-[#f1d27a]/35 bg-[#caa24c] py-4 font-bold uppercase tracking-[0.14em] text-[#050505] shadow-xl transition-colors hover:bg-[#f1d27a]"
                      >
                        Confirm Appointment
                      </motion.button>
                    </motion.form>
                  ) : (
                    <motion.div 
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center space-y-4"
                    >
                      <div className="mb-4 flex h-16 w-16 items-center justify-center bg-[#caa24c] text-black shadow-xl">
                        <Check className="h-8 w-8" strokeWidth={3} />
                      </div>
                      <h4 className="font-serif text-3xl">Tour Requested</h4>
                      <p className="text-sm text-[#d7c29a]/70">We&apos;ve received the request for selected day {selectedDate || firstAvailableDay}. A coordinator will call you to confirm.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </main>
  )
}
