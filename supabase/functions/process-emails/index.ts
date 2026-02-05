import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Email {
  id: string
  threadId: string
  subject: string
  from: string
  snippet: string
  date: string
  labelIds: string[]
}

type EmailLabel =
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

const LABEL_MAP: Record<EmailLabel, string> = {
  TO_REPLY: 'To Reply',
  AWAITING_REPLY: 'Awaiting Reply',
  FYI: 'FYI',
  ACTIONED: 'Actioned',
  NEWSLETTER: 'Newsletter',
  MARKETING: 'Marketing',
  CALENDAR: 'Calendar',
  RECEIPT: 'Receipt',
  NOTIFICATION: 'Notification',
  COLD_EMAIL: 'Cold Email',
}

async function fetchEmails(accessToken: string, section: 'inbox' | 'all', pageToken?: string): Promise<{ emails: Email[], nextPageToken?: string }> {
  // Build query to exclude already labeled emails
  const excludeLabels = Object.values(LABEL_MAP)
    .map(label => `-label:"${label}"`)
    .join(' ')

  // Build query based on section
  let baseQuery: string
  if (section === 'inbox') {
    baseQuery = `in:inbox ${excludeLabels}`
  } else {
    // All mail: exclude spam and trash
    baseQuery = `-in:spam -in:trash ${excludeLabels}`
  }

  const query = encodeURIComponent(baseQuery)

  // Fetch list of messages with pagination (only unlabeled)
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`
  if (pageToken) {
    url += `&pageToken=${pageToken}`
  }

  console.log('Fetching with query:', baseQuery)

  const listResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!listResponse.ok) {
    const error = await listResponse.text()
    throw new Error(`Failed to fetch emails: ${error}`)
  }

  const listData = await listResponse.json()
  const messages = listData.messages || []

  // Fetch details for each message
  const emails: Email[] = []
  for (const msg of messages) {
    const detailResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!detailResponse.ok) continue

    const detail = await detailResponse.json()
    const headers = detail.payload?.headers || []

    const getHeader = (name: string) =>
      headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    emails.push({
      id: detail.id,
      threadId: detail.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      snippet: detail.snippet || '',
      date: getHeader('Date'),
      labelIds: detail.labelIds || [],
    })
  }

  return { emails, nextPageToken: listData.nextPageToken }
}

async function classifyEmail(email: Email): Promise<EmailLabel> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const prompt = `Classify this email into exactly ONE category. Reply with ONLY the category name, nothing else.

Categories:
- TO_REPLY: Emails requiring my personal response (business inquiries, customer questions, important communications from known contacts)
- AWAITING_REPLY: Emails where I'm waiting for someone's response
- FYI: Important information I should know but don't need to respond to
- ACTIONED: Completed conversations with nothing left to do
- NEWSLETTER: Content from publications, blogs, or subscribed services
- MARKETING: Promotional emails about products, services, sales, or offers
- CALENDAR: Scheduling, meeting invites, or calendar notifications
- RECEIPT: Purchase confirmations, payment receipts, invoices, billing statements, order confirmations
- NOTIFICATION: System alerts, status updates, app notifications
- COLD_EMAIL: Unsolicited sales pitches, recruitment, partnership requests from unknown senders

Email:
From: ${email.from}
Subject: ${email.subject}
Preview: ${email.snippet}

Category:`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${error}`)
  }

  const data = await response.json()
  const classification = data.content[0]?.text?.trim().toUpperCase() as EmailLabel

  // Validate the classification
  if (!LABEL_MAP[classification]) {
    return 'FYI' // Default fallback
  }

  return classification
}

// Cache for label IDs
let labelCache: { id: string; name: string }[] | null = null

async function getAllLabels(accessToken: string): Promise<{ id: string; name: string }[]> {
  if (labelCache) return labelCache

  const listResponse = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!listResponse.ok) {
    throw new Error('Failed to fetch labels')
  }

  const data = await listResponse.json()
  labelCache = data.labels || []
  return labelCache
}

function getOurLabelNames(): string[] {
  return Object.values(LABEL_MAP)
}

async function getOurLabelIds(accessToken: string): Promise<string[]> {
  const allLabels = await getAllLabels(accessToken)
  const ourLabelNames = getOurLabelNames().map(n => n.toLowerCase())
  return allLabels
    .filter(l => ourLabelNames.includes(l.name.toLowerCase()))
    .map(l => l.id)
}

async function getOrCreateLabel(accessToken: string, labelName: string): Promise<string> {
  const allLabels = await getAllLabels(accessToken)
  const existingLabel = allLabels.find(
    (l) => l.name.toLowerCase() === labelName.toLowerCase()
  )

  if (existingLabel) {
    return existingLabel.id
  }

  // Create new label
  const createResponse = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    }
  )

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create label: ${error}`)
  }

  const newLabel = await createResponse.json()

  // Update cache
  if (labelCache) {
    labelCache.push({ id: newLabel.id, name: newLabel.name })
  }

  return newLabel.id
}

async function applyLabel(
  accessToken: string,
  messageId: string,
  labelId: string
): Promise<void> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addLabelIds: [labelId],
        // Don't archive or mark as read - keep in inbox as unread
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to modify message: ${error}`)
  }
}

serve(async (req) => {
  console.log('Function started, method:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Request body received, has accessToken:', !!body.accessToken)

    const { accessToken, pageToken, section = 'all' } = body

    if (!accessToken) {
      console.log('ERROR: No access token provided')
      throw new Error('Access token is required')
    }

    const sectionLabel = section === 'inbox' ? 'Inbox' : 'All Mail'
    console.log(`Fetching unlabeled emails (${sectionLabel})...`, pageToken ? `(page: ${pageToken})` : '(first page)')
    // Fetch only unlabeled emails from specified section
    const { emails, nextPageToken } = await fetchEmails(accessToken, section, pageToken)
    console.log('Found', emails.length, 'unlabeled emails, nextPageToken:', !!nextPageToken)

    const results: { email: Email; label: EmailLabel }[] = []
    let errors = 0
    let skipped = 0

    // Process each email
    for (const email of emails) {
      try {
        // Classify with Claude
        const label = await classifyEmail(email)

        // Get or create Gmail label
        const labelId = await getOrCreateLabel(accessToken, LABEL_MAP[label])

        // Apply label only (keep in inbox, keep unread)
        await applyLabel(accessToken, email.id, labelId)

        results.push({ email, label })
      } catch (err) {
        console.error(`Error processing email ${email.id}:`, err)
        errors++
      }
    }

    return new Response(
      JSON.stringify({
        total: emails.length,
        processed: results.length,
        skipped,
        errors,
        results,
        nextPageToken,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
