#!/usr/bin/env node
// Pulls a full SQL dump of the linked Supabase project (schema + data) into
// ./backups/spt-<timestamp>.sql via the Supabase CLI. The file is plain SQL
// and can be replayed against any Postgres database (e.g.
// `psql -f backups/<file>.sql` against a fresh Supabase project) to fully
// restore everything.
//
// Usage:
//   npm run backup                       # full dump (schema + data)
//   npm run backup -- --data-only        # data only, no DDL
//   npm run backup -- --schema-only      # schema only, no rows
//
// Requirements:
//   - Supabase CLI on PATH (`brew install supabase/tap/supabase`).
//   - `supabase link --project-ref <ref>` already run once.

import { execSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = join(dirname(__filename), '..')
const backupsDir = join(repoRoot, 'backups')
mkdirSync(backupsDir, { recursive: true })

// YYYYMMDD-HHMMSS in the local timezone — keeps filenames sortable and
// easy to match against a wall-clock memory ("the backup right before
// the doctor visit on the 14th").
function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

const extraArgs = process.argv.slice(2)
const suffix = extraArgs.includes('--data-only')
  ? '-data'
  : extraArgs.includes('--schema-only')
    ? '-schema'
    : ''
const outPath = join(backupsDir, `spt-${timestamp()}${suffix}.sql`)

const cmd = ['supabase', 'db', 'dump', '--linked', '-f', outPath, ...extraArgs]
console.log(`> ${cmd.join(' ')}`)
try {
  execSync(cmd.join(' '), { stdio: 'inherit', cwd: repoRoot })
} catch (err) {
  console.error('\nBackup failed.')
  if (err && err.status != null) process.exit(err.status)
  process.exit(1)
}

const bytes = statSync(outPath).size
const human =
  bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`
console.log(`\nWrote ${outPath} (${human})`)
console.log(
  'To restore against a fresh Supabase project:\n' +
    `  psql "$DATABASE_URL" -f ${outPath}\n` +
    '(get DATABASE_URL from Supabase Dashboard > Project Settings > Database)',
)
