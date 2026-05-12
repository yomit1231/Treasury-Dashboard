import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { autoDetectAndParse, parseCheckRegister } from '../lib/parsers'

export default function ImportModal({ type, accounts, onClose, onSuccess }) {
  const [status, setStatus] = useState('idle')  // idle | parsing | saving | done | error
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [fileText, setFileText] = useState('')
  const fileRef = useRef()

  const isBankImport = type === 'bank'
  const title = isBankImport ? 'Import bank CSV' : 'Import check register'
  const description = isBankImport
    ? 'Upload a CSV from MCB, IDB, Old National, Valley Bank, or Bankwell. Format is auto-detected.'
    : 'Upload your check register CSV. Outstanding check adjustments will be recalculated automatically.'

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      setFileText(text)
      setStatus('parsing')
      setMessage('')

      try {
        if (isBankImport) {
          const result = autoDetectAndParse(text)
          if (!result) { setStatus('error'); setMessage('Could not detect file format. Please check the file.'); return }
          const balCount = Object.keys(result.balances).length
          const txnCount = result.transactions.length
          setPreview({ balances: result.balances, transactions: result.transactions, balCount, txnCount })
          setStatus('ready')
          setMessage(`Found ${balCount} account balances and ${txnCount} transactions.`)
        } else {
          const adj = parseCheckRegister(text)
          const adjCount = Object.keys(adj).length
          setPreview({ adjustments: adj, adjCount })
          setStatus('ready')
          setMessage(`Found ${adjCount} accounts. Outstanding checks calculated (numbered checks only).`)
        }
      } catch (err) {
        setStatus('error')
        setMessage('Error parsing file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  async function handleSave() {
    setStatus('saving')
    setMessage('Saving to database…')

    try {
      if (isBankImport) {
        const { balances, transactions } = preview

        // Upsert balances
        const balRows = Object.entries(balances).map(([acctNum, b]) => {
          const acctObj = accounts.find(a => a.account_number === acctNum)
          return {
            account_number: acctNum,
            balance: b.balance,
            balance_date: b.balance_date,
            bank_source: acctObj?.bank_name || 'Unknown',
          }
        })

        // Delete old balances for these accounts first, then insert
        const acctNums = Object.keys(balances)
        await supabase.from('balances').delete().in('account_number', acctNums)
        if (balRows.length > 0) {
          const { error } = await supabase.from('balances').insert(balRows)
          if (error) throw error
        }

        // Insert transactions (batch by month)
        if (transactions.length > 0) {
          const period = transactions[0]?.txn_date?.substring(0, 7) || ''
          if (period) {
            await supabase.from('transactions').delete().eq('period_month', period).in('account_number', acctNums)
          }
          // Enrich with bank_source
          const enriched = transactions.map(t => {
            const acctObj = accounts.find(a => a.account_number === t.account_number)
            return {
              ...t,
              bank_source: acctObj?.bank_name || 'Unknown',
              period_month: t.txn_date?.substring(0, 7) || ''
            }
          })
          // Insert in chunks of 500
          for (let i = 0; i < enriched.length; i += 500) {
            const { error } = await supabase.from('transactions').insert(enriched.slice(i, i + 500))
            if (error) throw error
          }
        }

        setStatus('done')
        setMessage(`✓ Saved ${balRows.length} balances and ${transactions.length} transactions.`)

      } else {
        // Check register
        const { adjustments } = preview
        const rows = []
        Object.entries(adjustments).forEach(([acctNum, adj]) => {
          const acctObj = accounts.find(a => a.account_number === acctNum)
          const bankBal = null // will be joined from balances table
          rows.push({
            account_number: acctNum,
            last_rec_date: adj.last_rec_date,
            outstanding_checks: adj.outstanding_checks,
            adjusted_balance: null, // calculated at read time: balance - outstanding
          })
        })

        // Delete existing and re-insert
        const acctNums = rows.map(r => r.account_number)
        await supabase.from('check_adjustments').delete().in('account_number', acctNums)
        if (rows.length > 0) {
          const { error } = await supabase.from('check_adjustments').insert(rows)
          if (error) throw error
        }

        setStatus('done')
        setMessage(`✓ Saved check adjustments for ${rows.length} accounts.`)
      }

      setTimeout(onSuccess, 1200)

    } catch (err) {
      setStatus('error')
      setMessage('Save failed: ' + err.message)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px', width: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'DM Sans, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0, letterSpacing: '-0.03em' }}>{title}</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0' }}>{description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div
          onClick={() => fileRef.current.click()}
          style={{
            border: '2px dashed #e5e5e5', borderRadius: 12, padding: '32px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 16, background: '#fafafa',
            transition: 'border-color 0.15s'
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = '#1a1a1a'}
          onMouseOut={e => e.currentTarget.style.borderColor = '#e5e5e5'}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#444' }}>Click to select CSV file</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>.csv files only</div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {message && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
            background: status === 'error' ? '#fef2f2' : status === 'done' ? '#f0fdf4' : '#f0f9ff',
            color: status === 'error' ? '#991b1b' : status === 'done' ? '#166534' : '#0c4a6e',
            border: `1px solid ${status === 'error' ? '#fecaca' : status === 'done' ? '#bbf7d0' : '#bae6fd'}`
          }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', background: '#f7f7f5', border: '1px solid #e5e5e5',
            borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444'
          }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={status !== 'ready'}
            style={{
              padding: '9px 18px', background: status === 'ready' ? '#1a1a1a' : '#ccc',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: status === 'ready' ? 'pointer' : 'not-allowed', color: '#fff'
            }}
          >
            {status === 'saving' ? 'Saving…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
