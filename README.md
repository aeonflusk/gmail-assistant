# Gmail AI Assistant

Automatically sort and label your Gmail emails using AI-powered classification.

## Features

- Sign in with Google OAuth
- Fetch unread emails from Gmail
- Classify emails using Claude AI into 10 categories
- Automatically apply Gmail labels
- Archive processed emails

## Email Categories

| Label | Description |
|-------|-------------|
| To Reply | Needs your personal response |
| Awaiting Reply | Waiting for their response |
| FYI | Important info, no action needed |
| Actioned | Completed conversations |
| Newsletter | Subscribed content |
| Marketing | Promotional emails |
| Calendar | Meetings & scheduling |
| Receipt | Purchases & payments |
| Notification | System alerts |
| Cold Email | Unsolicited outreach |

## Setup

### Prerequisites

- Node.js 18+
- Supabase account
- Google Cloud project with Gmail API enabled
- Anthropic API key

### 1. Clone and Install

```bash
git clone https://github.com/aeonflusk/gmail-assistant.git
cd gmail-assistant
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Enable Google OAuth provider in Authentication > Providers
3. Add these Gmail scopes to your Google OAuth configuration:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`

### 4. Deploy Edge Function

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase secrets set ANTHROPIC_API_KEY=your-api-key
npx supabase functions deploy process-emails
```

### 5. Run Development Server

```bash
npm run dev
```

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Supabase (Auth, Edge Functions)
- Anthropic Claude API
- Gmail API

## License

MIT
