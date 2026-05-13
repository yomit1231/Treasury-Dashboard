import Papa from 'papaparse'

// Detect which bank format a file is
// Valley/Bankwell: has Opening Ledger + Closing Ledger summary section (checked first)
// MCB/IDB/ONB: uses Record Type column with Balance/Detail rows
export function detectFormat(text) {
  if (text.includes('Opening Ledger') && text.includes('Closing Ledger')) return 'valley_bankwell'
  if (text.includes('Record Type') && text.includes('Balance') && text.includes('Detail')) return 'mcb_idb_onb'
  if (text.includes('Record Type') && text.includes('Balance')) return 'mcb_idb_onb'
  if (text.includes('BAI Type') && text.includes('BAI Code')) return 'mcb_idb_onb'
  return 'unknown'
}

// Parse MCB / IDB / Old National format
// Columns: Record Type, Account Number, Account Name, Date, Credit Amount, Debit Amount, Code, Description, Reference, Memo
export function parseMCBFormat(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => l.startsWith('Record Type,'))
  if (headerIdx === -1) return { balances: {}, transactions: [] }

  const rows = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true }).data

  const balancesByAcct = {}
  const transactions = []
  const PREFER = ['Closing Ledger', 'Current Balance', 'Closing Available', 'Opening Ledger', 'Average Closing Ledger MTD']

  rows.forEach(row => {
    const rtype = (row['Record Type'] || '').trim()
    const acct = (row['Account Number'] || '').trim()
    const desc = (row['Description'] || '').trim()
    const credit = parseFloat((row['Credit Amount'] || '').replace(/[$,]/g, '')) || 0
    const debit = parseFloat((row['Debit Amount'] || '').replace(/[$,]/g, '')) || 0
    const date = (row['Date'] || '').trim()
    const memo = (row['Memo'] || '').trim()

    if (rtype === 'Balance') {
      if (!balancesByAcct[acct]) balancesByAcct[acct] = {}
      if (!balancesByAcct[acct][date]) balancesByAcct[acct][date] = {}
      balancesByAcct[acct][date][desc] = credit || debit || null
    } else if (rtype === 'Detail') {
      const amt = credit ? credit : debit ? -debit : 0
      if (amt !== 0) {
        transactions.push({ account_number: acct, txn_date: date, description: desc, memo, amount: amt })
      }
    }
  })

  // Extract balances: latest for display + all daily for trends
  const balances = {}        // latest per account (for dashboard display)
  const dailyBalances = []   // all dates (for trend tracking)

  Object.entries(balancesByAcct).forEach(([acct, dateMap]) => {
    const sortedDates = Object.keys(dateMap).sort().reverse()
    let foundLatest = false
    for (const date of sortedDates) {
      for (const key of PREFER) {
        const val = dateMap[date][key]
        if (val != null && val !== 0) {
          // Save daily balance for trend tracking
          dailyBalances.push({ account_number: acct, balance: val, balance_date: date })
          // Save latest as the display balance
          if (!foundLatest) {
            balances[acct] = { balance: val, balance_date: date }
            foundLatest = true
          }
          break
        }
      }
    }
  })

  return { balances, dailyBalances, transactions }
}

// Parse Valley Bank / Bankwell format
// Balance section: Date, ABA Routing #, Currency, Account Number, Account Name, Opening Ledger, CR Amount, CR Count, DB Amount, DB Count, Closing Ledger
// Transaction section: Date, ABA Routing #, Currency, Account Number, Account Name, BAI Type, BAI Code, CR Amount, DB Amount, Serial Num, Ref Num, Description
export function parseValleyFormat(text) {
  const lines = text.split('\n')
  const balances = {}
  const transactions = []

  // Find balance header: contains 'Opening Ledger' and 'Closing Ledger'
  const balHeaderIdx = lines.findIndex(l => l.includes('Opening Ledger') && l.includes('Closing Ledger'))
  // Find transaction header: contains 'BAI Type' and 'BAI Code'
  const txnHeaderIdx = lines.findIndex(l => l.includes('BAI Type') && l.includes('BAI Code'))

  if (balHeaderIdx !== -1) {
    const balEnd = txnHeaderIdx !== -1 ? txnHeaderIdx : lines.length
    const balRows = Papa.parse(
      lines.slice(balHeaderIdx, balEnd).join('\n'),
      { header: true, skipEmptyLines: true }
    ).data

    balRows.forEach(row => {
      const acct = (row['Account Number'] || '').trim()
      if (!acct || acct === 'Totals' || acct === '') return
      // Use Closing Ledger as the balance, fall back to Opening Ledger
      const closingRaw = (row['Closing Ledger'] || '').replace(/[$,]/g, '').trim()
      const openingRaw = (row['Opening Ledger'] || '').replace(/[$,]/g, '').trim()
      const closing = parseFloat(closingRaw)
      const opening = parseFloat(openingRaw)
      const val = !isNaN(closing) ? closing : !isNaN(opening) ? opening : null
      // Date is a range like "01/01/2026 - 05/12/2026" — use the end date
      const dateRange = (row['Date'] || '').trim()
      const endDate = dateRange.includes(' - ') ? dateRange.split(' - ')[1].trim() : dateRange
      if (acct && val !== null) {
        balances[acct] = { balance: val, balance_date: endDate }
      }
    })
  }

  if (txnHeaderIdx !== -1) {
    const txnRows = Papa.parse(
      lines.slice(txnHeaderIdx).join('\n'),
      { header: true, skipEmptyLines: true }
    ).data

    txnRows.forEach(row => {
      const acct = (row['Account Number'] || '').trim()
      if (!acct) return
      const date = (row['Date'] || '').trim()
      if (!date.match(/^\d{2}\/\d{2}\/\d{4}/)) return
      const cr = parseFloat((row['CR Amount'] || '').replace(/[$,]/g, '')) || 0
      const db = parseFloat((row['DB Amount'] || '').replace(/[$,]/g, '')) || 0
      const amt = cr - db
      if (amt === 0) return
      transactions.push({
        account_number: acct,
        txn_date: date,
        description: (row['BAI Type'] || '').trim(),
        memo: (row['Description'] || '').trim(),
        amount: Math.round(amt * 100) / 100
      })
    })
  }

  // Build daily balances array for trend tracking
  const dailyBalances = Object.entries(balances).map(([acct, b]) => ({
    account_number: acct,
    balance: b.balance,
    balance_date: b.balance_date
  }))

  return { balances, dailyBalances, transactions }
}

// Parse check register CSV
// Supports two formats:
// Old format: date=parts[1], doc=parts[3], amount=parts[6], cleared=parts[7]
// New format: date=parts[1], doc=parts[7], amount=parts[9], cleared=parts[12]
export function parseCheckRegister(text) {
  const lines = text.split('\n')
  const results = {}
  let currentAcct = null

  // Auto-detect format by checking column count of first data row
  let useNewFormat = false
  for (const line of lines) {
    if (line.startsWith(',')) {
      const parts = Papa.parse(line, {}).data[0] || []
      if (parts.length >= 13) { useNewFormat = true }
      break
    }
  }

  lines.forEach(line => {
    if (line.includes('Account no:')) {
      const acctMatch = line.match(/Account no:\s*(\S+)/)
      if (acctMatch) {
        currentAcct = acctMatch[1].replace(/,.*/, '').trim().replace(/^0+/, '') || '0'
        results[currentAcct] = { rows: [] }
      }
      return
    }
    if (!line.startsWith(',') || !currentAcct) return

    const parts = Papa.parse(line, {}).data[0] || []
    if (!parts[1] || !parts[1].match(/^\d{2}\/\d{2}\/\d{4}/)) return

    const date = parts[1].trim()
    let doc, amtRaw, cleared

    if (useNewFormat) {
      // New format: doc=parts[7], amount=parts[9], cleared=parts[12]
      doc = (parts[7] || '').trim()
      amtRaw = (parts[9] || '').replace(/[$,]/g, '')
      cleared = (parts[12] || '').trim()
    } else {
      // Old format: doc=parts[3], amount=parts[6], cleared=parts[7]
      doc = (parts[3] || '').trim()
      amtRaw = (parts[6] || '').replace(/[$,]/g, '')
      cleared = (parts[7] || '').trim()
    }

    const amount = parseFloat(amtRaw)
    if (!isNaN(amount) && amount > 0) {
      results[currentAcct].rows.push({ date, doc, amount, cleared })
    }
  })

  // For each account: last rec date + numbered checks in transit only
  const adjustments = {}
  Object.entries(results).forEach(([acct, data]) => {
    const rows = data.rows

    // Last rec = max date value that looks like a date (MM/DD/YYYY) in cleared column
    const clearedDates = rows
      .filter(r => r.cleared && r.cleared.match(/^\d{2}\/\d{2}\/\d{4}$/))
      .map(r => new Date(r.cleared))
      .filter(d => !isNaN(d))
    const lastRec = clearedDates.length ? new Date(Math.max(...clearedDates)) : null

    // Numbered checks in transit only
    const outstandingChecks = rows
      .filter(r => r.cleared === 'In transit' && /^\d+$/.test(r.doc))
      .reduce((sum, r) => sum + r.amount, 0)

    adjustments[acct] = {
      last_rec_date: lastRec ? lastRec.toLocaleDateString('en-US') : null,
      outstanding_checks: Math.round(outstandingChecks * 100) / 100
    }
  })

  return adjustments
}

export function autoDetectAndParse(text) {
  const fmt = detectFormat(text)
  if (fmt === 'mcb_idb_onb') return parseMCBFormat(text)
  if (fmt === 'valley_bankwell') return parseValleyFormat(text)
  return null
}
