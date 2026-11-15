export type LeadNoteType = 'note' | 'call_log' | 'email_log'

export type NoteSlashCommandKey = 'call' | 'followup' | 'tour' | 'summary' | 'next-steps'

export type LeadNoteContextPayload = {
  lead: {
    id: string
    fullName: string
    eventType?: string | null
    targetDate?: string | null
    guestCount?: number | null
    packageInterest?: string | null
    status?: string | null
    pipelineStage?: string | null
    preferredTourDate?: string | null
    preferredTourTime?: string | null
    message?: string | null
  }
  calls?: Array<{
    direction?: string
    status?: string
    createdAt?: string
    duration?: number | null
    transcript?: string | null
    summary?: string | null
    notes?: string | null
  }>
  notes?: Array<{
    noteType?: string
    content?: string
    createdAt?: string
  }>
  emails?: Array<{
    subject?: string
    from?: string
    to?: string
    snippet?: string
    date?: string
  }>
  texts?: Array<{
    direction?: string
    body?: string
    createdAt?: string
  }>
  tasks?: Array<{
    title?: string
    description?: string | null
    status?: string
    dueDate?: string | null
  }>
}
