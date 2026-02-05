import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { LoginButton } from './components/LoginButton'
import { Dashboard } from './components/Dashboard'
import type { User } from '@supabase/supabase-js'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Gmail Assistant</h1>
            <p className="text-gray-600">
              Automatically sort your emails using AI-powered classification
            </p>
          </div>
          <div className="flex justify-center">
            <LoginButton />
          </div>
          <p className="text-xs text-gray-500 text-center mt-6">
            We'll request access to read and label your Gmail messages
          </p>
        </div>
      </div>
    )
  }

  return <Dashboard userEmail={user.email || ''} onLogout={handleLogout} />
}

export default App
