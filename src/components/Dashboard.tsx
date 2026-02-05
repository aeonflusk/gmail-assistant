import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { ProcessingResult, EmailLabel } from '../types'

interface DashboardProps {
  userEmail: string
  onLogout: () => void
}

const LABEL_COLORS: Record<EmailLabel, string> = {
  TO_REPLY: 'bg-red-100 text-red-800',
  AWAITING_REPLY: 'bg-yellow-100 text-yellow-800',
  FYI: 'bg-blue-100 text-blue-800',
  ACTIONED: 'bg-green-100 text-green-800',
  NEWSLETTER: 'bg-purple-100 text-purple-800',
  MARKETING: 'bg-pink-100 text-pink-800',
  CALENDAR: 'bg-indigo-100 text-indigo-800',
  RECEIPT: 'bg-emerald-100 text-emerald-800',
  NOTIFICATION: 'bg-gray-100 text-gray-800',
  COLD_EMAIL: 'bg-orange-100 text-orange-800',
}

const LABEL_DESCRIPTIONS: Record<EmailLabel, string> = {
  TO_REPLY: 'Needs your response',
  AWAITING_REPLY: 'Waiting for their response',
  FYI: 'Info only, no action needed',
  ACTIONED: 'Completed',
  NEWSLETTER: 'Subscribed content',
  MARKETING: 'Promotional',
  CALENDAR: 'Meetings & scheduling',
  RECEIPT: 'Purchases, payments & invoices',
  NOTIFICATION: 'System alerts',
  COLD_EMAIL: 'Unsolicited outreach',
}

interface TotalStats {
  total: number
  processed: number
  skipped: number
  errors: number
  batches: number
}

export function Dashboard({ userEmail, onLogout }: DashboardProps) {
  const [processing, setProcessing] = useState(false)
  const [processingAll, setProcessingAll] = useState(false)
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [totalStats, setTotalStats] = useState<TotalStats | null>(null)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const stopRequestedRef = useRef(false)

  const processOneBatch = async (providerToken: string, section: 'inbox' | 'all', pageToken?: string): Promise<ProcessingResult> => {
    const { data, error: fnError } = await supabase.functions.invoke('process-emails', {
      body: { accessToken: providerToken, section, pageToken },
    })

    if (fnError) {
      throw new Error(fnError.message || JSON.stringify(fnError))
    }

    if (data?.error) {
      throw new Error(data.error)
    }

    return data as ProcessingResult
  }

  const [currentSection, setCurrentSection] = useState<'inbox' | 'all'>('inbox')

  const handleStop = () => {
    stopRequestedRef.current = true
  }

  const handleProcessSection = async (section: 'inbox' | 'all') => {
    stopRequestedRef.current = false
    setProcessingAll(true)
    setProcessing(true)
    setCurrentSection(section)
    setError(null)
    setResult(null)
    setCurrentBatch(0)
    setTotalStats({ total: 0, processed: 0, skipped: 0, errors: 0, batches: 0 })

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const providerToken = sessionData.session?.provider_token

      if (!providerToken) {
        throw new Error('No Gmail access token. Please sign out and sign in again.')
      }

      let allResults: ProcessingResult['results'] = []
      let stats: TotalStats = { total: 0, processed: 0, skipped: 0, errors: 0, batches: 0 }
      let nextPageToken: string | undefined = undefined

      while (true) {
        stats.batches++
        setCurrentBatch(stats.batches)

        const batchResult = await processOneBatch(providerToken, section, nextPageToken)

        stats.total += batchResult.total
        stats.processed += batchResult.processed
        stats.skipped += batchResult.skipped || 0
        stats.errors += batchResult.errors
        allResults = [...allResults, ...batchResult.results]

        setTotalStats({ ...stats })
        setResult({
          total: stats.total,
          processed: stats.processed,
          skipped: stats.skipped,
          errors: stats.errors,
          results: allResults,
        })

        // Check if there are more pages
        nextPageToken = batchResult.nextPageToken

        // Stop if no more pages
        if (!nextPageToken) {
          break
        }

        // Check if stop was requested
        if (stopRequestedRef.current) {
          console.log('Stop requested by user')
          break
        }

        // Small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setProcessing(false)
      setProcessingAll(false)
    }
  }

  const labelCounts = result?.results.reduce((acc, { label }) => {
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {} as Record<EmailLabel, number>)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">Gmail Assistant</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{userEmail}</span>
            <button
              onClick={onLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Process Emails</h2>
          <p className="text-gray-600 mb-4">
            Classify your inbox emails using AI and apply labels automatically.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleProcessSection('inbox')}
              disabled={processing}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processingAll && currentSection === 'inbox' ? `Processing Inbox... (Batch ${currentBatch})` : 'Process Inbox'}
            </button>
            <button
              onClick={() => handleProcessSection('all')}
              disabled={processing}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processingAll && currentSection === 'all' ? `Processing All Mail... (Batch ${currentBatch})` : 'Process All Mail'}
            </button>
            {processing && (
              <button
                onClick={handleStop}
                className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {result && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Summary {totalStats && totalStats.batches > 1 && `(${totalStats.batches} batches)`}
              </h2>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-3xl font-bold text-gray-900">{result.total}</p>
                  <p className="text-sm text-gray-600">Total Fetched</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-3xl font-bold text-green-600">{result.processed}</p>
                  <p className="text-sm text-gray-600">Processed</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-3xl font-bold text-yellow-600">{result.skipped || 0}</p>
                  <p className="text-sm text-gray-600">Already Labeled</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-3xl font-bold text-red-600">{result.errors}</p>
                  <p className="text-sm text-gray-600">Errors</p>
                </div>
              </div>
            </div>

            {labelCounts && Object.keys(labelCounts).length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">By Label</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(labelCounts).map(([label, count]) => (
                    <span
                      key={label}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${LABEL_COLORS[label as EmailLabel]}`}
                    >
                      {label.replace('_', ' ')}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.results.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Processed Emails</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {result.results.map(({ email, label }) => (
                    <div key={email.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-gray-900 truncate flex-1">{email.subject || '(No subject)'}</p>
                        <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${LABEL_COLORS[label]}`}>
                          {label.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">From: {email.from}</p>
                      <p className="text-sm text-gray-500 truncate">{email.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!result && !error && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Label Guide</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(LABEL_DESCRIPTIONS).map(([label, description]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${LABEL_COLORS[label as EmailLabel]}`}>
                    {label.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-gray-600">{description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
