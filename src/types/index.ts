export type EmailLabel =
  | 'TO_REPLY'
  | 'AWAITING_REPLY'
  | 'FYI'
  | 'ACTIONED'
  | 'NEWSLETTER'
  | 'MARKETING'
  | 'CALENDAR'
  | 'RECEIPT'
  | 'NOTIFICATION'
  | 'COLD_EMAIL'

export interface Email {
  id: string
  threadId: string
  subject: string
  from: string
  snippet: string
  date: string
}

export interface ProcessedEmail {
  id: string
  gmail_id: string
  subject: string
  from_email: string
  assigned_label: EmailLabel
  processed_at: string
}

export interface ProcessingResult {
  total: number
  processed: number
  skipped: number
  errors: number
  results: {
    email: Email
    label: EmailLabel
  }[]
  nextPageToken?: string
}
