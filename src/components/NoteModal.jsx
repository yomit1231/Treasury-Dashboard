import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NoteModal({ accounts, user, userName, onClose, onSuccess }) {
  const facilities = [...new Set(accounts.map(a => a.facility))].sort()
  const [facility, setFacility] = useState('')
  const [txnDate, setTxnDate] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!note.trim()) { setError('Note is required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('notes').insert({
      facility: facility || null,
      txn_date: txnDate || null,
      amount: amount ? parseFloat(amount) : null,
      note: note.trim(),
      created_by: user.id,
      created_by_name: userName || user.email
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSuccess()
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e5e5e5',
    borderRadius: 8, fontSize: 13, color: '#1a1a1a', outline: 'none',
    background: '#fafafa', boxSizing: 'border-box'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px', width: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'DM Sans, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' }}>Add note</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20 }}>×</button>
        </div>

        {[
          { label: 'Facility', node: (
            <select value={facility} onChange={e => setFacility(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {facilities.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )},
          { label: 'Date', node: <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} style={inputStyle} /> },
          { label: 'Amount (optional)', node: <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} /> },
          { label: 'Note *', node: <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Describe this transaction…" style={{ ...inputStyle, resize: 'vertical' }} /> },
        ].map(({ label, node }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 6 }}>{label}</label>
            {node}
          </div>
        ))}

        {error && <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', background: '#f7f7f5', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}
