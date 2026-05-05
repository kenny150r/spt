#!/usr/bin/env node
// Bulk-import historical entries from a "feeds & diapers" spreadsheet (CSV).
//
// Usage (from repo root):
//   npm run import -- "/path/to/your.csv"
//   npm run import -- "/path/to/your.csv" --year=2026
//   npm run import -- "/path/to/your.csv" --dry-run
//
// You'll be prompted for your Supabase email + password (the same one you use
// to sign in to the app). The script signs in, lists your babies, parses the
// CSV, prints a summary, and asks for confirmation before inserting anything.
//
// CSV format expected (loosely):
//   Date , Time , breast feeding time , Bottle , Diaper , (empty) , Notes
//
//   Date is sticky (only set on the first row of a day); Time is HHMM-ish
//   (e.g. 415 -> 04:15, "Midnight" -> 00:00). Breast / Bottle accept "30 min",
//   "30mL", "40", "30 mL?", or non-numeric values like "Sleepy"/"Refused"
//   which are skipped. Diaper text is matched against keywords for
//   pee/poop/both. Weights are picked out of Notes if they look like grams
//   ("2252g", "2273 grams", or a bare 4-digit number 1500-8000).

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// ---------- args ----------
const args = process.argv.slice(2)
const csvPath = args.find((a) => !a.startsWith('--'))
const yearArg = args.find((a) => a.startsWith('--year='))
const dryRun = args.includes('--dry-run')

if (!csvPath) {
  console.error('Usage: npm run import -- "<path-to-csv>" [--year=2026] [--dry-run]')
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!dryRun && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.\n' +
      'Tip: the `npm run import` script loads .env automatically; make sure both keys are set there.',
  )
  process.exit(1)
}

const defaultYear = new Date().getFullYear()
const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : defaultYear

const supabase = !dryRun
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

// ---------- CSV parser (handles quoted fields with commas / newlines) ----------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // ignore
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ---------- field parsers ----------
function parseDateStr(s) {
  if (!s) return null
  const cleaned = s.trim()
  if (!cleaned) return null
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) }
}

function parseTimeStr(s) {
  if (!s) return null
  const cleaned = s.trim().toLowerCase()
  if (!cleaned || cleaned === '-') return null
  if (cleaned.startsWith('midnight')) return { h: 0, m: 0 }
  if (cleaned.startsWith('noon')) return { h: 12, m: 0 }
  const digits = cleaned.replace(/\D/g, '')
  if (!digits) return null
  const padded = digits.padStart(4, '0').slice(-4)
  const h = parseInt(padded.slice(0, 2), 10)
  const m = parseInt(padded.slice(2), 10)
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null
  return { h, m }
}

function combineLocal(year, month, day, h, m) {
  // Use the script's local timezone; toISOString() converts to UTC for storage.
  return new Date(year, month - 1, day, h, m, 0).toISOString()
}

function parseLeadingNumber(s) {
  if (!s) return null
  const cleaned = s.trim()
  if (!cleaned || cleaned === '-') return null
  const m = cleaned.match(/^(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function parseDiaper(s) {
  if (!s) return null
  const lower = s.trim().toLowerCase()
  if (!lower || lower === '-') return null
  if (/dry/.test(lower)) return null

  let hasPee = /\b(urine|pee|wet)\b/.test(lower)
  if (/no urine/.test(lower)) hasPee = false

  const hasPoop =
    /\b(stool|poo+|smear|dump|blow ?out|bm|mustard|bas[- ]?turd|inglorious|colossal|massive)\b/.test(
      lower,
    ) || /1\s*\+\s*2/.test(lower)

  if (hasPee && hasPoop) return 'both'
  if (hasPoop) return 'poop'
  if (hasPee) return 'pee'
  return null
}

function parseWeightFromNotes(notes) {
  if (!notes) return null
  // "2252g", "2273 grams" — explicit unit anywhere in the note.
  const m = notes.match(/\b(\d{4})\s*g(?:rams?)?\b/i)
  if (m) return parseFloat(m[1]) / 1000
  // Bare 4-digit number, BUT only if it's the very first token of the note,
  // otherwise it's almost certainly a time (e.g. "Angry baby at 2300...").
  const m2 = notes.match(/^\s*(\d{4})\b/)
  if (m2) {
    const v = parseInt(m2[1], 10)
    if (v >= 1500 && v <= 8000) return v / 1000
  }
  return null
}

// ---------- I/O helpers ----------
async function prompt(question) {
  const rl = createInterface({ input, output })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    stdin.resume()
    stdin.setRawMode?.(true)
    stdin.setEncoding('utf8')
    let pw = ''
    const onData = (data) => {
      const chunk = data.toString()
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          process.stdout.write('\n')
          resolve(pw)
          return
        } else if (ch === '\u0003') {
          process.exit(1)
        } else if (ch === '\u007f') {
          if (pw.length > 0) {
            pw = pw.slice(0, -1)
            process.stdout.write('\b \b')
          }
        } else {
          pw += ch
          process.stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}

// ---------- main ----------
const csvText = await readFile(csvPath, 'utf8')
const rows = parseCsv(csvText)
const data = rows.slice(1).filter((r) => r.some((c) => c && c.trim()))
console.log(`Parsed ${data.length} non-empty rows from ${csvPath}.`)

let baby
if (dryRun) {
  baby = { id: '00000000-0000-0000-0000-000000000000', name: '(dry-run baby)' }
  console.log('\n--dry-run: skipping sign-in and using a placeholder baby id.')
} else {
  const email = process.env.SUPABASE_USER_EMAIL || (await prompt('Supabase email: '))
  const password =
    process.env.SUPABASE_USER_PASSWORD || (await promptHidden('Password: '))

  console.log('\nSigning in...')
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr) {
    console.error('Sign-in failed:', signInErr.message)
    process.exit(1)
  }

  const { data: babies, error: babiesErr } = await supabase
    .from('babies')
    .select('*')
    .order('created_at', { ascending: true })
  if (babiesErr) {
    console.error('Failed to load babies:', babiesErr.message)
    process.exit(1)
  }
  if (!babies || babies.length === 0) {
    console.error('No babies found. Create one in the app first.')
    process.exit(1)
  }

  if (babies.length === 1) {
    baby = babies[0]
  } else {
    console.log('\nMultiple babies:')
    babies.forEach((b, i) => console.log(`  [${i}] ${b.name} (id: ${b.id})`))
    const choice = await prompt('Pick one [0]: ')
    baby = babies[parseInt(choice || '0', 10)] ?? babies[0]
  }
}
console.log(`Importing for: ${baby.name} (id: ${baby.id})`)
console.log(`Year for date column (override with --year=YYYY): ${year}\n`)

// ---------- parse rows into entries ----------
let curMonth = null
let curDay = null
const feeds = []
const diapers = []
const weights = []
const skipped = []

for (const [idx, row] of data.entries()) {
  const rowNum = idx + 2 // human-friendly (1-based, +1 for header)
  const dateStr = row[0]
  const timeStr = row[1]
  const breastStr = row[2]
  const bottleStr = row[3]
  const diaperStr = row[4]
  // row[5] is the empty spacer column in this CSV
  const notesStr = row[6] ?? ''

  const date = parseDateStr(dateStr)
  if (date) {
    curMonth = date.month
    curDay = date.day
  }

  const time = parseTimeStr(timeStr)
  if (!time) {
    skipped.push({ row: rowNum, reason: `unparseable time: "${timeStr ?? ''}"` })
    continue
  }
  if (curMonth === null || curDay === null) {
    skipped.push({ row: rowNum, reason: 'no date set yet' })
    continue
  }

  const at = combineLocal(year, curMonth, curDay, time.h, time.m)
  const notes = (notesStr || '').trim()

  let producedSomething = false

  const breastMin = parseLeadingNumber(breastStr)
  if (breastMin !== null && breastMin > 0) {
    feeds.push({
      baby_id: baby.id,
      fed_at: at,
      type: 'breast',
      duration_min: breastMin,
      amount_ml: null,
      side: null,
      notes: notes || null,
    })
    producedSomething = true
  }

  const bottleMl = parseLeadingNumber(bottleStr)
  if (bottleMl !== null && bottleMl > 0) {
    feeds.push({
      baby_id: baby.id,
      fed_at: at,
      type: 'bottle',
      amount_ml: bottleMl,
      duration_min: null,
      side: null,
      notes: notes || null,
    })
    producedSomething = true
  }

  const diaperType = parseDiaper(diaperStr)
  if (diaperType) {
    diapers.push({
      baby_id: baby.id,
      occurred_at: at,
      type: diaperType,
      notes: notes || null,
    })
    producedSomething = true
  }

  const weightKg = parseWeightFromNotes(notes)
  if (weightKg) {
    weights.push({
      baby_id: baby.id,
      measured_at: at,
      weight_kg: Number(weightKg.toFixed(3)),
      notes: notes || null,
    })
    producedSomething = true
  }

  if (!producedSomething) {
    skipped.push({
      row: rowNum,
      reason: `no parseable feed/diaper/weight (breast=${JSON.stringify(breastStr)}, bottle=${JSON.stringify(bottleStr)}, diaper=${JSON.stringify(diaperStr)})`,
    })
  }
}

console.log('Parse summary:')
console.log(
  `  Feeds:   ${feeds.length}  (${feeds.filter((f) => f.type === 'bottle').length} bottle, ${feeds.filter((f) => f.type === 'breast').length} breast)`,
)
console.log(`  Diapers: ${diapers.length}`)
console.log(`  Weights: ${weights.length}`)
console.log(`  Skipped: ${skipped.length}`)
if (skipped.length > 0) {
  const previewN = Math.min(skipped.length, 12)
  for (let i = 0; i < previewN; i++) {
    const s = skipped[i]
    console.log(`    row ${s.row}: ${s.reason}`)
  }
  if (skipped.length > previewN) {
    console.log(`    …and ${skipped.length - previewN} more`)
  }
}

if (dryRun) {
  console.log('\n--dry-run set; nothing was inserted.')
  process.exit(0)
}

console.log(
  '\nWARNING: this will insert these rows into Supabase. Running it twice will create duplicates.',
)
const ans = await prompt('Insert now? [y/N]: ')
if (!/^y(es)?$/i.test(ans)) {
  console.log('Aborted; nothing inserted.')
  process.exit(0)
}

async function bulkInsert(table, rows) {
  if (rows.length === 0) return
  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      console.error(`\nFailed inserting ${table} batch starting at ${i}:`, error.message)
      process.exit(1)
    }
    process.stdout.write(
      `  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`,
    )
  }
  console.log()
}

console.log('\nInserting...')
await bulkInsert('feeds', feeds)
await bulkInsert('diapers', diapers)
await bulkInsert('weights', weights)
console.log('\nDone.')
process.exit(0)
