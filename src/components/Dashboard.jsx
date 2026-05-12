import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ImportModal from './ImportModal'
import NoteModal from './NoteModal'

const TL = {
  OP:'Operating', NG:'Non-Gov AR', Gov:'Government AR', PR:'Payroll',
  PNA:'PNA / RFMS', LOC:'Line of Credit', MM:'Money Market',
  Realty:'Realty', Capex:'Capex', Other:'Other'
}
const TB = {
  OP:'#dbeafe|#1e40af', NG:'#dcfce7|#166534', Gov:'#fef3c7|#92400e',
  PR:'#d1fae5|#065f46', PNA:'#ede9fe|#5b21b6', LOC:'#fee2e2|#991b1b',
  MM:'#fce7f3|#9d174d', Realty:'#f3f4f6|#374151', Capex:'#e0f2fe|#0c4a6e',
  Other:'#f9fafb|#6b7280'
}

function Badge({ type }) {
  const [bg, color] = (TB[type] || TB.Other).split('|')
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 20,
      background: bg, color, fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      {TL[type] || type}
    </span>
  )
}

function fmt(v) {
  if (v == null) return '—'
  const s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? '(' + s + ')' : s
}
function fmtM(v) { return '$' + (v / 1e6).toFixed(2) + 'M' }

const TABS = ['Facilities', 'Banks', 'Check Register', 'Activity', 'Notes']
const ADMIN_TABS = ['Facilities', 'Banks', 'Check Register', 'Activity', 'Notes', 'Import']

export default function Dashboard() {
  const { user, role, userName, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Facilities')
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState({})       // acct_num -> {balance, balance_date, bank_source}
  const [checkAdj, setCheckAdj] = useState({})       // acct_num -> {last_rec_date, outstanding_checks, adjusted_balance}
  const [transactions, setTransactions] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [showNote, setShowNote] = useState(false)
  // Filters
  const [facFilter, setFacFilter] = useState('all')
  const [bankFilter, setBankFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [txnSearch, setTxnSearch] = useState('')
  const [expanded, setExpanded] = useState({})

  const loadData = useCallback(async () => {
    setLoading(true)
    const [acctRes, balRes, adjRes, txnRes, noteRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('active', true).order('facility').order('type'),
      supabase.from('balances').select('*'),
      supabase.from('check_adjustments').select('*'),
      supabase.from('transactions').select('*').order('txn_date', { ascending: false }).limit(500),
      supabase.from('notes').select('*').order('created_at', { ascending: false })
    ])
    setAccounts(acctRes.data || [])

    const balMap = {}
    ;(balRes.data || []).forEach(b => {
      if (!balMap[b.account_number] || b.balance_date > balMap[b.account_number].balance_date)
        balMap[b.account_number] = b
    })
    setBalances(balMap)

    const adjMap = {}
    ;(adjRes.data || []).forEach(a => { adjMap[a.account_number] = a })
    setCheckAdj(adjMap)

    setTransactions(txnRes.data || [])
    setNotes(noteRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function getDisplayBal(acctNum, type) {
    const adj = checkAdj[acctNum]
    if (type === 'OP' && adj) {
      return { val: adj.adjusted_balance, adjusted: true, rec: adj.last_rec_date, outstanding: adj.outstanding_checks }
    }
    const b = balances[acctNum]
    return { val: b?.balance ?? null, adjusted: false, rec: null, outstanding: 0 }
  }

  const facMap = {}
  accounts.forEach(a => {
    if (!facMap[a.facility]) facMap[a.facility] = []
    facMap[a.facility].push(a)
  })

  function getFacBal(fac) {
    let tot = 0, any = false
    ;(facMap[fac] || []).forEach(a => {
      const d = getDisplayBal(a.account_number, a.type)
      if (d.val != null) { tot += d.val; any = true }
    })
    return any ? tot : null
  }

  const facilities = [...new Set(accounts.map(a => a.facility))].sort()
  const banks = [...new Set(accounts.map(a => a.bank_name))].sort()
  const types = [...new Set(accounts.map(a => a.type))].sort()

  const filteredAccounts = accounts.filter(a =>
    (facFilter === 'all' || a.facility === facFilter) &&
    (bankFilter === 'all' || a.bank_name === bankFilter) &&
    (typeFilter === 'all' || a.type === typeFilter)
  )

  const totalBal = accounts.reduce((s, a) => {
    const d = getDisplayBal(a.account_number, a.type)
    return s + (d.val || 0)
  }, 0)

  const totalOutstanding = Object.values(checkAdj).reduce((s, a) => s + (a.outstanding_checks || 0), 0)
  const negCount = Object.values(checkAdj).filter(a => a.adjusted_balance != null && a.adjusted_balance < 0).length

  const tabs = isAdmin ? ADMIN_TABS : TABS

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <p style={{ color: '#888', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>Loading…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top nav */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #ebebeb',
        padding: '0 24px', display: 'flex', alignItems: 'center', height: 56, gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: '#1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="10" rx="2" stroke="white" strokeWidth="1.5"/>
              <path d="M5 4V3a3 3 0 016 0v1" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em' }}>Treasury</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { id: 'fac', label: 'Facility', val: facFilter, set: setFacFilter, opts: facilities },
            { id: 'bank', label: 'Bank', val: bankFilter, set: setBankFilter, opts: banks },
            { id: 'type', label: 'Type', val: typeFilter, set: setTypeFilter, opts: types },
          ].map(f => (
            <select key={f.id} value={f.val} onChange={e => f.set(e.target.value)} style={{
              background: '#f7f7f5', border: '1px solid #e5e5e5', borderRadius: 7,
              padding: '5px 8px', fontSize: 12, color: '#444', outline: 'none'
            }}>
              <option value="all">All {f.label}s</option>
              {f.opts.map(o => <option key={o} value={o}>{TL[o] || o}</option>)}
            </select>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#888' }}>
            {userName || user?.email} · <span style={{
              fontSize: 11, padding: '2px 6px', borderRadius: 10,
              background: isAdmin ? '#fef3c7' : '#f0f9ff', color: isAdmin ? '#92400e' : '#0c4a6e',
              fontWeight: 500
            }}>{role}</span>
          </span>
          <button onClick={() => { signOut(); navigate('/login') }} style={{
            background: 'none', border: '1px solid #e5e5e5', borderRadius: 7,
            padding: '5px 10px', fontSize: 12, color: '#666', cursor: 'pointer'
          }}>Sign out</button>
        </div>
      </header>

      <div style={{ padding: '20px 24px' }}>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Adjusted balance', value: fmtM(totalBal), sub: `${Object.keys(checkAdj).length} OP accounts adjusted` },
            { label: 'Outstanding checks', value: fmtM(totalOutstanding), sub: 'Numbered checks only' },
            { label: 'Rec date', value: '04/30/2026', sub: 'Most accounts' },
            { label: 'Facilities', value: facilities.length, sub: 'With balance data' },
            { label: negCount > 0 ? '⚠ Negative' : 'Negative balances', value: negCount, sub: negCount > 0 ? 'Review needed' : 'All positive', alert: negCount > 0 },
          ].map((m, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 10, padding: '14px 16px',
              border: `1px solid ${m.alert ? '#fecaca' : '#ebebeb'}`,
              background: m.alert ? '#fef2f2' : '#fff'
            }}>
              <div style={{ fontSize: 11, color: m.alert ? '#991b1b' : '#888', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: m.alert ? '#991b1b' : '#1a1a1a', letterSpacing: '-0.03em' }}>{m.value}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #ebebeb', paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 14px', fontSize: 13, border: 'none', background: 'none',
              cursor: 'pointer', color: tab === t ? '#1a1a1a' : '#888', fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? '2px solid #1a1a1a' : '2px solid transparent',
              marginBottom: -1, letterSpacing: '-0.01em', transition: 'all 0.1s',
              fontFamily: 'inherit'
            }}>{t}</button>
          ))}
        </div>

        {/* ── FACILITIES TAB ── */}
        {tab === 'Facilities' && (
          <div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
              Operating balances adjusted for outstanding numbered checks · rec date 04/30/2026
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
              {[...new Set(filteredAccounts.map(a => a.facility))].sort().map(fac => {
                const accts = filteredAccounts.filter(a => a.facility === fac)
                const bal = getFacBal(fac)
                const isNeg = bal != null && bal < 0
                const open = expanded[fac]
                return (
                  <div key={fac} style={{
                    background: '#fff', borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${isNeg ? '#fecaca' : '#ebebeb'}`
                  }}>
                    <div
                      onClick={() => setExpanded(e => ({ ...e, [fac]: !e[fac] }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                        cursor: 'pointer', borderBottom: open ? '1px solid #ebebeb' : 'none'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em' }}>
                          {fac}{isNeg && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6, fontWeight: 400 }}>⚠ negative</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                          {[...new Set(accts.map(a => a.bank_name))].join(' · ')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginRight: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: isNeg ? '#ef4444' : '#1a1a1a' }}>
                          {bal != null ? fmt(bal) : <span style={{ color: '#ccc', fontWeight: 400, fontSize: 12 }}>—</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{accts.length} accounts</div>
                      </div>
                      <span style={{ color: '#ccc', fontSize: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                    </div>
                    {open && accts.map(a => {
                      const d = getDisplayBal(a.account_number, a.type)
                      const isNegBal = d.val != null && d.val < 0
                      return (
                        <div key={a.id}>
                          {d.adjusted && d.outstanding > 0 && (
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', padding: '5px 14px',
                              background: isNegBal ? '#fef2f2' : '#fafafa',
                              borderBottom: '1px solid #f0f0f0', fontSize: 11,
                              color: isNegBal ? '#991b1b' : '#888'
                            }}>
                              <span>Outstanding checks: {fmt(d.outstanding)}</span>
                              <span>rec {d.rec || <span style={{ color: '#f59e0b' }}>no rec</span>}</span>
                            </div>
                          )}
                          <div style={{
                            display: 'grid', gridTemplateColumns: '1fr auto auto',
                            alignItems: 'center', gap: 8, padding: '9px 14px',
                            borderBottom: '1px solid #f5f5f5', background: d.adjusted ? '#fafafa' : '#fff'
                          }}>
                            <div>
                              <div style={{ fontSize: 13, color: '#1a1a1a' }}>{a.account_id}</div>
                              <div style={{ fontSize: 11, color: '#aaa', marginTop: 1, fontFamily: 'DM Mono, monospace' }}>
                                {a.account_number}
                              </div>
                            </div>
                            <Badge type={a.type} />
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: isNegBal ? '#ef4444' : '#1a1a1a' }}>
                                {d.val != null ? fmt(d.val) : <span style={{ color: '#ccc', fontWeight: 400 }}>—</span>}
                              </div>
                              {d.adjusted && balances[a.account_number] && (
                                <div style={{ fontSize: 10, color: '#aaa' }}>bank: {fmt(balances[a.account_number].balance)}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── BANKS TAB ── */}
        {tab === 'Banks' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {[...new Set(filteredAccounts.map(a => a.bank_name))].sort().map(bank => {
              const accts = filteredAccounts.filter(a => a.bank_name === bank)
              const facs = [...new Set(accts.map(a => a.facility))].sort()
              let tot = 0, hasBal = false
              accts.forEach(a => { const d = getDisplayBal(a.account_number, a.type); if (d.val != null) { tot += d.val; hasBal = true } })
              return (
                <div key={bank} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #ebebeb' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 3 }}>{bank}</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>{accts.length} accounts · {facs.length} facilit{facs.length === 1 ? 'y' : 'ies'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {[...new Set(accts.map(a => a.type))].map(t => <Badge key={t} type={t} />)}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>{facs.join(', ')}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginTop: 10, letterSpacing: '-0.02em' }}>
                    {hasBal ? fmt(tot) : <span style={{ color: '#ccc', fontWeight: 400, fontSize: 13 }}>Balance pending</span>}
                  </div>
                  {hasBal && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>check-adjusted where applicable</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── CHECK REGISTER TAB ── */}
        {tab === 'Check Register' && (
          <div>
            {negCount > 0 && (
              <div style={{
                background: '#fef3c7', borderLeft: '3px solid #f59e0b', borderRadius: '0 8px 8px 0',
                padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e'
              }}>
                ⚠ {negCount} account{negCount > 1 ? 's' : ''} with negative adjusted balance — outstanding checks exceed bank balance.
              </div>
            )}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #ebebeb' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>Outstanding checks by operating account</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Numbered checks only · ACH transfers and wires excluded</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['Facility', 'Account', 'Last rec', 'Bank balance', 'Outstanding checks', 'Adjusted balance'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h.includes('balance') || h.includes('checks') ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ebebeb', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(checkAdj).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([acct, adj]) => {
                      const acctObj = accounts.find(a => a.account_number === acct)
                      const fac = acctObj?.facility || '—'
                      const bal = balances[acct]?.balance
                      const isNeg = adj.adjusted_balance != null && adj.adjusted_balance < 0
                      return (
                        <tr key={acct} style={{ background: isNeg ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: '9px 14px', color: '#1a1a1a', fontWeight: 500 }}>{fac}</td>
                          <td style={{ padding: '9px 14px', color: '#666', fontSize: 11 }}>{acctObj?.account_id || acct}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 10,
                              background: adj.last_rec_date ? '#dcfce7' : '#fef3c7',
                              color: adj.last_rec_date ? '#166534' : '#92400e', fontWeight: 500
                            }}>
                              {adj.last_rec_date || 'no rec'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{fmt(bal)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: '#92400e', fontFamily: 'DM Mono, monospace' }}>{fmt(adj.outstanding_checks)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: isNeg ? '#ef4444' : '#166534', fontFamily: 'DM Mono, monospace' }}>
                            {adj.adjusted_balance != null ? fmt(adj.adjusted_balance) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === 'Activity' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
                placeholder="Search memo or facility…"
                style={{
                  background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: '7px 12px', fontSize: 13, outline: 'none', width: 220
                }}
              />
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {[['Date','80px'], ['Facility','110px'], ['Type','70px'], ['Bank','90px'], ['Description','140px'], ['Memo','200px'], ['Amount','90px']].map(([h, w]) => (
                        <th key={h} style={{ width: w, padding: '8px 11px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ebebeb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter(t => {
                        const acctObj = accounts.find(a => a.account_number === t.account_number)
                        const fac = acctObj?.facility || ''
                        const q = txnSearch.toLowerCase()
                        return !q || (t.memo || '').toLowerCase().includes(q) || fac.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
                      })
                      .slice(0, 200)
                      .map((t, i) => {
                        const acctObj = accounts.find(a => a.account_number === t.account_number)
                        return (
                          <tr key={t.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '8px 11px', color: '#888' }}>{t.txn_date}</td>
                            <td style={{ padding: '8px 11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acctObj?.facility || '—'}</td>
                            <td style={{ padding: '8px 11px' }}>{acctObj && <Badge type={acctObj.type} />}</td>
                            <td style={{ padding: '8px 11px', color: '#666' }}>{t.bank_source}</td>
                            <td style={{ padding: '8px 11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                            <td style={{ padding: '8px 11px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.memo}</td>
                            <td style={{ padding: '8px 11px', textAlign: 'right', fontWeight: 600, fontFamily: 'DM Mono, monospace', color: t.amount > 0 ? '#166534' : '#991b1b' }}>
                              {t.amount > 0 ? '+' : ''}{fmt(t.amount)}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── NOTES TAB ── */}
        {tab === 'Notes' && (
          <div>
            {isAdmin && (
              <button onClick={() => setShowNote(true)} style={{
                marginBottom: 14, background: '#1a1a1a', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', letterSpacing: '-0.01em'
              }}>+ Add note</button>
            )}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', overflow: 'hidden' }}>
              {notes.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No notes yet</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['Date', 'Facility', 'Amount', 'Note', 'Added by'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ebebeb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n, i) => (
                      <tr key={n.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '9px 14px', color: '#888' }}>{n.txn_date || '—'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 500 }}>{n.facility || '—'}</td>
                        <td style={{ padding: '9px 14px', fontFamily: 'DM Mono, monospace' }}>{n.amount != null ? fmt(n.amount) : '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#444' }}>{n.note}</td>
                        <td style={{ padding: '9px 14px', color: '#aaa' }}>{n.created_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── IMPORT TAB (admin only) ── */}
        {tab === 'Import' && isAdmin && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 700 }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #ebebeb' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Bank CSV</div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>MCB · IDB · Old National · Valley · Bankwell — auto-detected</div>
                <button onClick={() => setShowImport('bank')} style={{
                  width: '100%', background: '#1a1a1a', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                }}>Upload bank CSV</button>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #ebebeb' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Check register</div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>Recalculates outstanding check adjustments for all facilities</div>
                <button onClick={() => setShowImport('checks')} style={{
                  width: '100%', background: '#1a1a1a', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                }}>Upload check register</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal
          type={showImport}
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); loadData() }}
        />
      )}

      {showNote && (
        <NoteModal
          accounts={accounts}
          user={user}
          userName={userName}
          onClose={() => setShowNote(false)}
          onSuccess={() => { setShowNote(false); loadData() }}
        />
      )}
    </div>
  )
}
