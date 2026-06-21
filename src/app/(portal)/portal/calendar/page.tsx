"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, User } from "lucide-react";

// Types
type ViewMode = "month" | "day" | "week";

// Mock Data
const MOCK_EVENTS = [
  { id: 1, date: 5, title: "Client Consultation", time: "10:00 - 11:00", type: "meeting" },
  { id: 2, date: 15, title: "Wedding: Smith & Jones", time: "14:00 - 23:00", type: "wedding" },
  { id: 3, date: 15, title: "Vendor Load-in", time: "10:00 - 12:00", type: "logistics" },
  { id: 4, date: 18, title: "Corporate Seminar", time: "09:00 - 17:00", type: "corporate" },
  { id: 5, date: 22, title: "Quinceañera: Isabella", time: "16:00 - 24:00", type: "birthday" },
  { id: 6, date: 25, title: "Venue Tour", time: "11:00 - 12:00", type: "tour" },
];

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<number | null>(null);

  // We mock a standard 30-day view for frontend demonstration
  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);
  const firstDayOfMonth = 2; // e.g., starts on Tuesday

  const handleNextDay = () => {
    if (selectedDate && selectedDate < 30) setSelectedDate(selectedDate + 1);
  };

  const handlePrevDay = () => {
    if (selectedDate && selectedDate > 1) setSelectedDate(selectedDate - 1);
  };

  return (
    <div className="space-y-8 pb-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white/90">Event Calendar</h1>
          <p className="text-zinc-500 font-medium text-sm mt-1">Manage bookings, tours, and resource allocation.</p>
        </div>
        
        {/* View Toggles */}
        <div className="flex items-center gap-1 bg-black/60 border border-zinc-900 rounded-lg p-1 backdrop-blur-xl shadow-lg">
          <button 
            onClick={() => { setView("month"); setSelectedDate(null); }}
            className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${view === "month" ? "bg-[#002FA7]/20 text-blue-400 border border-[#002FA7]/30 shadow-inner" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}
          >
            Monthly
          </button>
          <button 
            onClick={() => setView("week")}
            className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${view === "week" ? "bg-[#002FA7]/20 text-blue-400 border border-[#002FA7]/30 shadow-inner" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}
          >
            Weekly
          </button>
          <button 
            onClick={() => { 
                setView("day"); 
                if(!selectedDate) setSelectedDate(15); 
            }}
            className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${view === "day" ? "bg-[#002FA7]/20 text-blue-400 border border-[#002FA7]/30 shadow-inner" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}
          >
            Daily
          </button>
        </div>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {view === "month" && (
            <motion.div 
              key="month-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-8 shadow-2xl"
            >
              {/* Calendar Controls */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white font-serif tracking-tight">November 2026</h2>
                <div className="flex gap-2">
                  <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border border-zinc-900 bg-black/50"><ChevronLeft size={18} /></button>
                  <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border border-zinc-900 bg-black/50"><ChevronRight size={18} /></button>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-px bg-zinc-900/50 border border-zinc-900 overflow-hidden rounded-xl">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="bg-zinc-950 p-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center border-b border-zinc-900">
                    {day}
                  </div>
                ))}
                
                {/* Empty padding for the start of the month */}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-black/50 p-3 min-h-[120px]"></div>
                ))}

                {/* Actual Days */}
                {daysInMonth.map(day => {
                  const events = MOCK_EVENTS.filter(e => e.date === day);
                  return (
                    <motion.div 
                      key={day}
                      layoutId={`day-card-${day}`}
                      onClick={() => {
                        setSelectedDate(day);
                        setView("day");
                      }}
                      className="bg-zinc-950 p-3 min-h-[120px] transition-all hover:bg-zinc-900 cursor-pointer group relative flex flex-col gap-1 border border-transparent hover:border-zinc-800/50 hover:z-10"
                    >
                      <span className={`text-xs font-mono font-bold transition-colors ${events.length > 0 ? "text-white" : "text-zinc-600"} group-hover:text-[#002FA7]`}>
                        {day}
                      </span>
                      
                      <div className="mt-1 space-y-1.5 w-full">
                        {events.map(event => (
                          <div key={event.id} className="text-[10px] truncate px-2 py-1.5 rounded-md bg-[#002FA7]/10 text-blue-400 border border-[#002FA7]/20 font-medium">
                            {event.time.split(' ')[0]} - {event.title}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {view === "day" && selectedDate && (
            <motion.div 
              key="day-view"
              layoutId={`day-card-${selectedDate}`}
              initial={{ opacity: 0, borderTopLeftRadius: 100, borderTopRightRadius: 100 }}
              animate={{ opacity: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-8 lg:p-12 shadow-2xl min-h-[700px]"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900/50 pb-8 mb-8 gap-6">
                <div>
                  <motion.h2 
                    layoutId={`date-title-${selectedDate}`}
                    className="text-4xl font-bold text-white mb-2 font-serif tracking-tight"
                  >
                    November {selectedDate}, 2026
                  </motion.h2>
                  <p className="text-zinc-500 font-medium uppercase tracking-widest text-xs">Daily Forensic Schedule</p>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={handlePrevDay} 
                    disabled={selectedDate === 1} 
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50 text-xs font-bold uppercase tracking-widest"
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <button 
                    onClick={handleNextDay} 
                    disabled={selectedDate === 30} 
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50 text-xs font-bold uppercase tracking-widest"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                  <button 
                    onClick={() => setView("month")}
                    className="ml-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black border border-zinc-800 text-blue-400 hover:text-blue-300 hover:border-blue-500/30 transition-all text-xs font-bold uppercase tracking-widest"
                  >
                    <CalendarIcon size={16} /> Month View
                  </button>
                </div>
              </div>

              {/* Hourly Schedule Timeline */}
              <div className="relative border-l-2 border-zinc-900/50 ml-4 space-y-8 py-4">
                {MOCK_EVENTS.filter(e => e.date === selectedDate).length > 0 ? (
                  MOCK_EVENTS.filter(e => e.date === selectedDate).map((event, i) => (
                    <motion.div 
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.4 }}
                      className="relative pl-10"
                    >
                      {/* Timeline Dot */}
                      <div className="absolute -left-[7px] top-4 w-3 h-3 rounded-full bg-[#002FA7] shadow-[0_0_15px_#002FA7]" />
                      
                      {/* Event Card */}
                      <div className="nodal-module-glass rounded-xl p-6 border border-zinc-800/50 hover:bg-zinc-900/40 transition-colors cursor-default">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                          <div>
                            <h3 className="text-xl font-bold text-white mb-2">{event.title}</h3>
                            <div className="flex items-center gap-3 text-zinc-400 font-mono text-sm">
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/50 border border-zinc-800">
                                <Clock size={14} className="text-[#002FA7]" />
                                {event.time}
                              </span>
                            </div>
                          </div>
                          <span className="px-3 py-1.5 rounded bg-[#002FA7]/10 text-blue-400 border border-[#002FA7]/30 text-[10px] uppercase font-bold tracking-widest max-w-fit">
                            {event.type}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-6 mt-6 pt-5 border-t border-zinc-800/50 text-sm">
                          <div className="flex items-center gap-2 text-zinc-500 font-medium">
                            <MapPin size={16} className="text-zinc-600" /> Main Hall + Terrace
                          </div>
                          <div className="flex items-center gap-2 text-zinc-500 font-medium">
                            <User size={16} className="text-zinc-600" /> Sarah Client
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pl-10 text-zinc-600 font-medium flex items-center gap-3 text-sm uppercase tracking-widest mt-10"
                  >
                    <CalendarIcon size={18} /> No events scheduled for this operational day.
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {view === "week" && (
            <motion.div 
              key="week-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-8 shadow-2xl flex items-center justify-center min-h-[400px]"
            >
              <div className="text-center space-y-4">
                <CalendarIcon size={48} className="mx-auto text-zinc-800" />
                <h3 className="text-xl font-bold text-white">Weekly Pipeline</h3>
                <p className="text-zinc-500 text-sm">Weekly operational view is under construction.</p>
                <button onClick={() => setView("month")} className="text-blue-500 text-xs font-bold uppercase tracking-widest hover:text-blue-400 mt-4 block mx-auto">
                  Return to Monthly
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
