import React, { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await signIn(email, password)
    setLoading(false)
    if (err) setError('Invalid email or password.')
    else navigate('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f7f7f5', fontFamily: "'DM Sans', sans-serif"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 44px', width: 400,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid #ebebeb'
      }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="4" width="14" height="10" rx="2" stroke="white" strokeWidth="1.5"/>
                <path d="M5 4V3a3 3 0 016 0v1" stroke="white" strokeWidth="1.5"/>
                <circle cx="8" cy="9" r="1.5" fill="white"/>
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em' }}>
              Treasury
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' }}>
            Sign in
          </h1>
          <p style={{ fontSize: 14, color: '#888', margin: '6px 0 0', fontWeight: 400 }}>
            Access your treasury dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e5e5',
                borderRadius: 8, fontSize: 14, color: '#1a1a1a', outline: 'none',
                background: '#fafafa', boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
              onFocus={e => e.target.style.borderColor = '#1a1a1a'}
              onBlur={e => e.target.style.borderColor = '#e5e5e5'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e5e5',
                borderRadius: 8, fontSize: 14, color: '#1a1a1a', outline: 'none',
                background: '#fafafa', boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
              onFocus={e => e.target.style.borderColor = '#1a1a1a'}
              onBlur={e => e.target.style.borderColor = '#e5e5e5'}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#991b1b'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '11px', background: '#1a1a1a', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              letterSpacing: '-0.01em', transition: 'opacity 0.15s'
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
