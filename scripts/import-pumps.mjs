#!/usr/bin/env node
// Bulk-import historical pumping events from a free-form text log.
//
// Usage (from repo root):
//   npm run import-pumps -- "/path/to/bf.log"
//   npm run import-pumps -- "/path/to/bf.log" --year=2026
//   npm run import-pumps -- "/path/to/bf.log" --dry-run
//
// You'll be prompted for your Supabase email + password (the same one you use
// to sign in to the app). The script signs in, lists your babies, parses the
// log, prints a summary, and asks for confirmation before inserting anything.
//
// Log format (loosely):
//
//   M/D[ ...optional notes...]
//   HHMM [(content)] HHMM [(content)] ...
//
// Date headers are sticky until the next M/D line. Times are 4-digit
// (HHMM, e.g. 0345 = 03:45). The optional parenthesized content captures the
// pump amount and per-side breakdown. Examples we handle:
//
//   0300 0700 0900       -> three pumps, time-only (amount unknown)
//   0345 (50)            -> 50 mL, side unknown -> stored as 'both'
//   1830+BF              -> breastfeed only, no pump (skipped)
//   1515 (40 +BF)        -> 40 mL pumped, BF on the side
//   1515 (bf 25 min + 30)-> 30 mL pumped after a BF (bf-only minutes ignored)
//   0500 (left 60 + right 35 = 95mL)        -> L=60, R=35, total 95
//   0500 (15 right + 40 left = 55mL)        -> L=40, R=15, total 55
//   0500 (right side only. 20mL)            -> side='right', 20 mL
//   2100 (BF x 12 min)                      -> BF only, no pump (skipped)
//
// The script is conservative: when it can't parse a clear pump amount, it
// falls back to a pump entry with amount=null (just the timestamp), so you
// keep the timing data even if the volume was never recorded.

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// ---------- args ----------
const args = process.argv.slice(2)
const logPath = args.find((a) => !a.startsWith('--'))
const yearArg = args.find((a) => a.startsWith('--year='))
const dryRun = args.includes('--dry-run')

if (!logPath) {
  console.error('Usage: npm run import-pumps -- "<path-to-log>" [--year=2026] [--dry-run]')
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!dryRun && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.\n' +
      'Tip: the `npm run import-pumps` script loads .env automatically; make sure both keys are set there.',
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

// ---------- parsing ----------

function combineLocal(yr, mo, day, h, m) {
  const tzOffsetMs = new Date(yr, mo - 1, day, h, m).getTimezoneOffset() * 60_000
  return new Date(Date.UTC(yr, mo - 1, day, h, m) + tzOffsetMs).toISOString()
}

// Strip invisible / odd Unicode that the user's notes app injects.
function cleanText(s) {
  return s.replace(/[\u200E\u200F\u202F\u00A0\u2060]/g, ' ')
}

// Strip tokens that clearly aren't pump-volume numbers, so we can scan what's
// left for a plausible amount. Removes:
//   - drug doses: "advil 100", "ibuprofen 200", "Tylenol 1000", "Motrin 5",
//     "Keflex 250"
//   - pain / fraction ratings: "3/10", "9/10"
//   - durations: "12 min", "x 5", "x12"
//   - mm flange sizes: "16mm", "17 mm"
//   - suction levels: "L2", "L3" (but NOT "L 50 mL" — careful!)
function stripNonAmountNumbers(t) {
  return t
    .replace(/\b(?:advil|ibuprofen|tylenol|motrin|keflex|vanco|vancomycin)\s*\d+(?:\.\d+)?\s*(?:mg|g)?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*\/\s*\d+\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*min(?:ute)?s?\b/gi, ' ')
    .replace(/\bx\s*\d+(?:\.\d+)?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*mm\b/gi, ' ')
    .replace(/\bL\s*[1-3]\b(?!\s*\d)/g, ' ') // suction level "L2" / "L3"
    // Pump-machine self-reference like "spectra L2-3" is already gone above
    // but kill stray "L2-3" forms too.
    .replace(/\bL\s*\d-\d\b/g, ' ')
}

// Find a plausible pump-volume number anywhere in the content. Used as a
// fallback when the explicit L/R / "= X" / "(N mL)" patterns don't fire,
// e.g. "(redness improving. 50)" or "(35 but i leaked)".
function extractFallbackAmount(content) {
  const cleaned = stripNonAmountNumbers(content)
  const matches = cleaned.match(/\d+(?:\.\d+)?/g) || []
  // Pump amounts are roughly 5–200 mL — anything outside that is almost
  // certainly noise we missed.
  const candidates = matches.map(Number).filter((n) => n >= 5 && n <= 200)
  if (candidates.length === 0) return null
  // Prefer the LAST candidate — the user typically writes the amount at the
  // end of the note ("Pain 3/10. 70").
  return candidates[candidates.length - 1]
}

// Returns true if the content looks like a "BF only" note with no pumping.
function isBfOnlyNoPump(content) {
  if (!content) return false
  const t = content.toLowerCase()
  const mentionsBf = /\b(bf|breastfeed|breast\s*feed|nursed?|nursing|cluster\s*bf|skin\s*to\s*skin)\b/.test(t)
  if (!mentionsBf) return false
  // Phrases that explicitly say no pumping happened.
  if (/no\s+pump|didn['’]t\s+pump|deferred\s+pumping|did\s+not\s+pump|no\s+pumping/.test(t)) return true
  // If we can extract any plausible pump amount from the content, this
  // entry was a BF + pump combo, not pure BF.
  if (extractFallbackAmount(t) != null) return false
  return true
}

// Pull a pump amount + optional left/right breakdown out of one entry's
// parenthesized content. Returns:
//   { totalMl, leftMl, rightMl, side, durationMin, hasPump }
function parseContent(rawContent) {
  const empty = {
    totalMl: null,
    leftMl: null,
    rightMl: null,
    side: 'both',
    durationMin: null,
    hasPump: true,
  }
  const content = cleanText(rawContent || '').trim()
  if (!content) return empty // bare time -> pump with no amount info

  // BF-only short-circuit
  if (isBfOnlyNoPump(content)) {
    return { ...empty, hasPump: false }
  }

  const t = content

  // 1) Plain number only: "(50)" or "50 mL" or "(40 +BF)"
  const plainOnly = /^\s*(\d+(?:\.\d+)?)\s*(?:m?l)?\s*(?:\+\s*bf)?\s*$/i.exec(t)
  if (plainOnly) {
    return { ...empty, totalMl: +plainOnly[1] }
  }

  // 2) Try to find left/right pairs. We try several orderings because the
  // user's notes are inconsistent ("L 50 + R 35", "right 35 + left 55",
  // "15 right + 40 left", etc.).
  let leftMl = null
  let rightMl = null

  // Side-first patterns: "left X + right Y" / "right X + left Y" /
  // "L X + R Y" / "R X + L Y" / "L side X + right side Y", etc.
  const sideFirst = (whichFirst) => {
    const a = whichFirst === 'left' ? '(?:left|l\\s*(?:side|breast)?)' : '(?:right|r\\s*(?:side|breast)?)'
    const b = whichFirst === 'left' ? '(?:right|r\\s*(?:side|breast)?)' : '(?:left|l\\s*(?:side|breast)?)'
    return new RegExp(
      `\\b${a}\\s+(?:breast\\s+|side\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:m?l)?[^.]*?\\+\\s*${b}\\s+(?:breast\\s+|side\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:m?l)?`,
      'i',
    )
  }

  // Number-first patterns: "X right + Y left" / "X left + Y right"
  const numberFirst = (whichFirst) => {
    const a = whichFirst === 'left' ? '(?:left|l\\s*(?:side|breast)?)' : '(?:right|r\\s*(?:side|breast)?)'
    const b = whichFirst === 'left' ? '(?:right|r\\s*(?:side|breast)?)' : '(?:left|l\\s*(?:side|breast)?)'
    return new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*(?:m?l)?\\s+(?:on\\s+)?${a}\\b[^.]*?\\+\\s*(\\d+(?:\\.\\d+)?)\\s*(?:m?l)?\\s+(?:on\\s+)?${b}\\b`,
      'i',
    )
  }

  let m =
    sideFirst('left').exec(t) ||
    sideFirst('right').exec(t)
  if (m) {
    if (/^\s*(?:left|l)/i.test(m[0])) {
      leftMl = +m[1]
      rightMl = +m[2]
    } else {
      rightMl = +m[1]
      leftMl = +m[2]
    }
  } else {
    m =
      numberFirst('left').exec(t) ||
      numberFirst('right').exec(t)
    if (m) {
      if (/(?:left|l)\b/i.test(m[0].split('+')[0])) {
        leftMl = +m[1]
        rightMl = +m[2]
      } else {
        rightMl = +m[1]
        leftMl = +m[2]
      }
    }
  }

  // 3) Single-side with explicit "X right" / "X left" and no pair, e.g.
  // "right side only. 20mL", "pumped left side only for ... 15ml",
  // "Pumped 15 right". We only fire this when no pair was found AND the
  // text mentions only one side.
  if (leftMl == null && rightMl == null) {
    const onlyLeft = /\bleft\s+(?:side|breast)?\s*only\b/i.test(t)
    const onlyRight = /\bright\s+(?:side|breast)?\s*only\b/i.test(t)
    const sideOnly = onlyLeft || onlyRight
    if (sideOnly) {
      // Find the first amount in the content
      const amt = /(?<!min\s)(\d+(?:\.\d+)?)\s*ml/i.exec(t) || /=\s*(\d+(?:\.\d+)?)/i.exec(t)
      if (amt) {
        if (onlyLeft) leftMl = +amt[1]
        else rightMl = +amt[1]
      }
    }
  }

  // 4) "= X" total
  let totalMl =
    leftMl != null || rightMl != null
      ? (leftMl ?? 0) + (rightMl ?? 0)
      : null
  if (totalMl == null) {
    const eq = /=\s*(\d+(?:\.\d+)?)\s*(?:m?l)?/i.exec(t)
    if (eq) totalMl = +eq[1]
  }

  // 5) Last-ditch: a number followed by `ml` that isn't a duration. We
  // exclude numbers preceded by `min` or `x` (suction-level / minute markers).
  if (totalMl == null && leftMl == null && rightMl == null) {
    const nakedAmt = /(\d+(?:\.\d+)?)\s*ml/i.exec(t)
    if (nakedAmt) totalMl = +nakedAmt[1]
  }

  // 6) "+ X" trailing amount after a BF mention, e.g. "(bf 25 min + 30)" or
  // "(BF 8 min + 70)".
  if (totalMl == null && leftMl == null && rightMl == null) {
    const trailing = /(?:bf|breastfeed|nursed?)[^+]*\+\s*(\d+(?:\.\d+)?)\s*(?:ml)?\s*\)?\s*$/i.exec(t)
    if (trailing) totalMl = +trailing[1]
  }

  // 7) Generic free-text fallback — find any plausible pump-volume number
  // after stripping known-non-volume numbers (drug doses, pain ratings,
  // durations, suction levels, flange sizes). Catches "(redness improving.
  // 50)", "(35 but i leaked)", "(... 8 min pump. 30 ml right + 20 ml left ...
  // 80)", etc.
  if (totalMl == null && leftMl == null && rightMl == null) {
    totalMl = extractFallbackAmount(t)
  }

  // Determine side
  let side = 'both'
  if (leftMl != null && rightMl != null) side = 'both'
  else if (leftMl != null) side = 'left'
  else if (rightMl != null) side = 'right'

  // Try to capture a pump duration (the first "X min" / "x N min").
  let durationMin = null
  // Skip durations that are clearly attached to BF (e.g. "BF x 30 min",
  // "breastfeed 12 min").
  const dur = /(?<!\bbf[^.]{0,40}|\bbreastfeed[^.]{0,40}|\bnurse[ds]?[^.]{0,40})\b(?:x\s*)?(\d{1,3})\s*min(?:utes)?\b/i.exec(t)
  if (dur) {
    const v = +dur[1]
    // Sanity: pump sessions are typically 5-30 min, never 100+.
    if (v >= 1 && v <= 60) durationMin = v
  }

  return { totalMl, leftMl, rightMl, side, durationMin, hasPump: true }
}

// Pull every entry off a single line. An "entry" is a HHMM time marker
// (optionally with a "+BF" suffix) plus all the text between it and the next
// time marker. We capture *all* in-between text — including any orphan text
// outside parens — so notes with a stray paren like
//   "1600 (BF x 30 min right side only) 20 right + 30 left = 50mL)"
// still surface the pump amount.
function extractEntries(line) {
  const timeRe = /\b(\d{4})(\+BF)?/g
  const markers = []
  let m
  while ((m = timeRe.exec(line)) !== null) {
    const h = parseInt(m[1].slice(0, 2), 10)
    const mm = parseInt(m[1].slice(2), 10)
    if (h > 23 || mm > 59) continue
    markers.push({
      pos: m.index,
      end: m.index + m[0].length,
      time4: m[1],
      h,
      mm,
      bfMarker: !!m[2],
    })
  }
  const out = []
  for (let i = 0; i < markers.length; i++) {
    const tm = markers[i]
    const next = markers[i + 1]
    const between = line.slice(tm.end, next ? next.pos : line.length)
    // Flatten any number of parens within the slice — we just want the text.
    const content = between.replace(/[()]/g, ' ').trim()
    out.push({
      time4: tm.time4,
      h: tm.h,
      m: tm.mm,
      content: content || null,
      bfMarker: tm.bfMarker && !content,
    })
  }
  return out
}

function parseDateLine(line) {
  const m = line.match(/^\s*(\d{1,2})\/(\d{1,2})\b/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
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
const text = await readFile(logPath, 'utf8')
const lines = text.split('\n')

let baby
if (dryRun) {
  baby = { id: '00000000-0000-0000-0000-000000000000', name: '(dry-run baby)' }
  console.log('--dry-run: skipping sign-in and using a placeholder baby id.\n')
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

let curMonth = null
let curDay = null
const pumps = []
const skippedBfOnly = []
const debugSamples = []

// Some lines in the wild log have an unbalanced ( with no closing ) before
// the line ends (typo). Add a synthetic ) so the time/content regex can still
// capture the trailing entry.
function balanceParens(line) {
  const opens = (line.match(/\(/g) || []).length
  const closes = (line.match(/\)/g) || []).length
  return opens > closes ? line + ')'.repeat(opens - closes) : line
}

for (const [idx, rawLine] of lines.entries()) {
  const line = balanceParens(cleanText(rawLine).trimEnd())
  if (!line.trim()) continue

  const date = parseDateLine(line)
  if (date) {
    curMonth = date.month
    curDay = date.day
    continue
  }
  if (curMonth == null) continue

  const entries = extractEntries(line)
  for (const e of entries) {
    const at = combineLocal(year, curMonth, curDay, e.h, e.m)

    if (e.bfMarker) {
      skippedBfOnly.push({
        date: `${curMonth}/${curDay}`,
        time: e.time4,
        reason: 'BF marker (HHMM+BF)',
      })
      continue
    }

    const parsed = parseContent(e.content)
    if (!parsed.hasPump) {
      skippedBfOnly.push({
        date: `${curMonth}/${curDay}`,
        time: e.time4,
        reason: 'BF only',
      })
      continue
    }

    pumps.push({
      baby_id: baby.id,
      pumped_at: at,
      side: parsed.side,
      amount_ml: parsed.totalMl,
      // Per-side amounts go into their own columns so the chart can render
      // the actual L/R asymmetry instead of falling back to a 50/50 split.
      left_ml: parsed.leftMl,
      right_ml: parsed.rightMl,
      duration_min: parsed.durationMin,
      notes: null,
    })

    debugSamples.push({
      date: `${curMonth}/${curDay}`,
      time: e.time4,
      side: parsed.side,
      amount: parsed.totalMl,
      L: parsed.leftMl,
      R: parsed.rightMl,
      dur: parsed.durationMin,
      raw: e.content ? `(${e.content})` : '',
    })
  }

  // Soft heuristic: if the date line had `total Xml`, sanity-check our parse.
  // (We don't enforce this — just print diagnostics.)
}

// ---------- per-day total sanity check ----------
const lineTotals = new Map() // 'M/D' -> declared total mL
for (const rawLine of lines) {
  const line = cleanText(rawLine)
  const dm = line.match(/^\s*(\d{1,2})\/(\d{1,2})\b.*?total\s+(\d+(?:\.\d+)?)\s*ml/i)
  if (dm) {
    const key = `${parseInt(dm[1], 10)}/${parseInt(dm[2], 10)}`
    lineTotals.set(key, +dm[3])
  }
}

const parsedTotalsByDay = new Map()
for (const p of pumps) {
  const d = new Date(p.pumped_at)
  const key = `${d.getMonth() + 1}/${d.getDate()}`
  parsedTotalsByDay.set(key, (parsedTotalsByDay.get(key) ?? 0) + (p.amount_ml ?? 0))
}

console.log('Parse summary:')
console.log(`  Pumps:           ${pumps.length}`)
console.log(`  Skipped (BF):    ${skippedBfOnly.length}`)
const withSide = pumps.filter((p) => p.side === 'left' || p.side === 'right').length
const bothWithBreakdown = pumps.filter(
  (p) => p.side === 'both' && (p.left_ml != null || p.right_ml != null),
).length
const bothFlat = pumps.filter(
  (p) => p.side === 'both' && p.left_ml == null && p.right_ml == null,
).length
const noAmount = pumps.filter((p) => p.amount_ml == null).length
console.log(`  By side:         ${withSide} single-side, ${bothWithBreakdown} both (L/R logged), ${bothFlat} both (combined or unknown)`)
console.log(`  Without amount:  ${noAmount} (timing only)\n`)

// Print a small sample, biased toward entries with explicit L/R or
// fallback-extracted amounts so the user can sanity-check the parser.
const samplePool = [
  ...debugSamples.filter((s) => s.L != null || s.R != null).slice(0, 8),
  ...debugSamples.filter((s) => s.amount != null && s.L == null && s.R == null).slice(0, 8),
  ...debugSamples.filter((s) => s.amount == null).slice(0, 4),
]
console.log('Sample parsed entries (sanity check):')
for (const s of samplePool) {
  console.log(
    `  ${s.date.padEnd(5)} ${s.time}  side=${s.side.padEnd(5)}  amt=${String(s.amount ?? '-').padStart(4)}  L=${String(s.L ?? '-').padStart(4)}  R=${String(s.R ?? '-').padStart(4)}  ${s.raw.slice(0, 80)}${s.raw.length > 80 ? '…' : ''}`,
  )
}
console.log()

if (lineTotals.size > 0) {
  console.log('Day totals — declared in log vs sum of parsed pumps:')
  for (const [key, declared] of lineTotals.entries()) {
    const parsed = parsedTotalsByDay.get(key) ?? 0
    const delta = parsed - declared
    const flag =
      Math.abs(delta) <= Math.max(15, declared * 0.1) ? 'ok ' : 'CHECK'
    console.log(
      `  ${flag}  ${key.padEnd(6)} declared=${String(declared).padStart(4)}  parsed=${String(parsed).padStart(4)}  Δ=${delta >= 0 ? '+' : ''}${delta}`,
    )
  }
  console.log()
}

if (dryRun) {
  console.log('--dry-run set; nothing was inserted.')
  process.exit(0)
}

console.log(
  'WARNING: this will insert these rows into Supabase. Running it twice will create duplicates.',
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
    process.stdout.write(`\rInserted ${Math.min(i + batchSize, rows.length)} / ${rows.length} into ${table}…`)
  }
  process.stdout.write('\n')
}

await bulkInsert('pumps', pumps)
console.log('\nDone.')
