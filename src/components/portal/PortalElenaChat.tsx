'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  X, 
  Send, 
  Info,
  RefreshCw
} from 'lucide-react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'

type ExecutedQuery = {
  query: string
  result: unknown
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  executedQueries?: ExecutedQuery[]
}

interface PortalElenaChatProps {
  isOpen: boolean
  onClose: () => void
}

const suggestions = [
  'Show all booked events for this year',
  'List details of the last 3 inquiries',
  'Show any inventory items that are Low or Out of Stock',
  'What is our total revenue from invoices?',
  'List pending tasks sorted by due date'
]

export function PortalElenaChat({ isOpen, onClose }: PortalElenaChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey bestie! 💕 Your COO, CFO, Marketing guru, and business mentor is in the house. I've got full access to our Luxor database, so whether you want to crunch numbers, check leads, brainstorm marketing ideas, or get some operations advice, I've got your back. What are we tackling today?"
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    const userMessage = textToSend.trim()
    setInput('')
    
    // Add user message
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      // Map frontend messages to backend format
      const apiMessages = updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries
        }
      ])
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I ran into an error connecting to the query service. Please check your network and try again.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.aside 
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#caa24c]/10 bg-[#050505] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]"
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#caa24c]/10 px-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full border border-[#caa24c]/30 ring-2 ring-[#caa24c]/10">
            <Image 
              src="/luxor-concierge.png" 
              alt="Elena Assistant" 
              fill 
              className="object-cover"
            />
          </div>
          <div>
            <h3 className="font-serif text-base font-medium leading-none text-[#f7efe3]">Elena AI</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              CRM Intelligence Connected
            </span>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Close Elena Chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages Window */}
      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <motion.div 
              layout
              key={index} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.88, originX: msg.role === 'user' ? 1 : 0, originY: 1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={`flex items-start gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                    <Image src="/luxor-concierge.png" alt="Elena" fill className="object-cover" />
                  </div>
                )}
                <div 
                  className={`rounded-2xl px-4 py-2.5 shadow-sm text-sm border ${
                    msg.role === 'user'
                      ? 'rounded-tr-none bg-[#caa24c]/10 border-[#caa24c]/20 text-[#f7efe3]'
                      : 'rounded-tl-none bg-zinc-900/60 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  {renderFormattedContent(msg.content)}
                </div>
              </motion.div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <motion.div
              layout
              key="thinking-indicator"
              initial={{ opacity: 0, y: 20, scale: 0.9, originX: 0, originY: 1 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-2 max-w-[80%]"
            >
              <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                <Image src="/luxor-concierge.png" alt="Elena" fill className="object-cover" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-zinc-900/60 border border-zinc-800/80 px-4 py-3 text-zinc-400 text-xs flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-[#caa24c]" />
                <span>Querying venue database...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 1 && (
        <div className="border-t border-[#caa24c]/5 p-3 space-y-1.5 bg-[#050505]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-1">Suggested Requests</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-left text-xs text-zinc-450 hover:border-[#caa24c]/20 hover:bg-[#caa24c]/2 hover:text-[#f1d27a]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#caa24c]/10 bg-zinc-950/80 p-3">
        <form 
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
          className="relative flex items-center rounded-xl border border-zinc-800 bg-[#050505] px-3 py-1.5 focus-within:border-[#caa24c]/30"
        >
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Elena to query or update something..."
            className="flex-1 bg-transparent py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="ml-2 rounded-lg bg-[#caa24c]/10 border border-[#caa24c]/20 p-1.5 text-[#caa24c] hover:bg-[#caa24c]/20 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Send size={14} />
          </button>
        </form>
        <p className="mt-1.5 text-[9px] text-center text-zinc-650 flex items-center justify-center gap-1">
          <Info size={9} />
          Queries will run securely on the server with owner authorization.
        </p>
      </div>
    </motion.aside>
  )
}

/* Collapsible SQL Query Renderer */

/* Local formatting helper function */
function renderFormattedContent(content: string) {
  // Check if content contains markdown table pattern
  if (content.includes('|') && content.includes('\n|')) {
    const lines = content.split('\n')
    const tableHtml: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[][] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true
          tableRows = []
        }
        const cols = line.split('|').map(c => c.trim()).slice(1, -1)
        // Skip separator line: e.g. |---|---|
        if (cols.every(c => /^:-*|-*:-*|-*:$/.test(c))) {
          continue
        }
        tableRows.push(cols)
      } else {
        if (inTable) {
          tableHtml.push(renderTable(tableRows, i))
          inTable = false
        }
        if (line) {
          tableHtml.push(<p key={i} className="mb-2 text-sm leading-relaxed">{renderBoldAndLinks(line)}</p>)
        }
      }
    }
    if (inTable) {
      tableHtml.push(renderTable(tableRows, lines.length))
    }
    return <div>{tableHtml}</div>
  }

  // normal parsing
  return content.split('\n').map((line, idx) => {
    if (!line.trim()) return <div key={idx} className="h-2" />
    return <p key={idx} className="mb-2 text-sm leading-relaxed">{renderBoldAndLinks(line)}</p>
  })
}

function renderTable(rows: string[][], keyIndex: number) {
  if (rows.length === 0) return null
  const headers = rows[0]
  const bodyRows = rows.slice(1)
  return (
    <div key={keyIndex} className="my-3 overflow-x-auto rounded-lg border border-[#caa24c]/10 bg-[#050505] portal-scrollbar">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#caa24c]/10 bg-[#caa24c]/5 font-serif text-[#f1d27a]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {bodyRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-[#caa24c]/2 text-zinc-350">
              {row.map((col, cIdx) => (
                <td key={cIdx} className="px-3 py-2 whitespace-nowrap">{col}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderBoldAndLinks(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-[#caa24c]">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
