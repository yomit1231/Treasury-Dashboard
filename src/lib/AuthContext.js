import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getUserRole } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)      // 'admin' | 'partner' | null
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadRole(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await loadRole(session.user.id)
      else { setRole(null); setUserName(''); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadRole(userId) {
    const data = await getUserRole(userId)
    setRole(data?.role ?? null)
    setUserName(data?.name ?? '')
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isAdmin = role === 'admin'
  const isPartner = role === 'partner'

  return (
    <AuthContext.Provider value={{ user, role, userName, loading, signIn, signOut, isAdmin, isPartner }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
