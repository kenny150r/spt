// Edge Function: /functions/v1/ask
//
// Proxies user questions about their baby data to the Gemini API. The
// Gemini API key lives only as a Supabase secret (`GEMINI_API_KEY`) so it
// never touches the client. Each request must carry the user's Supabase
// access token; the function uses that token to read data via PostgREST,
// which keeps Row Level Security in force end-to-end.
//
// Deploy:
//   supabase functions deploy ask
//   supabase secrets set GEMINI_API_KEY=<your-key>
//
// Request body:
//   { babyId: string, rangeDays?: number, messages: ChatMsg[] }
//
// Response body:
//   { reply: string, model: string, tokens?: { prompt: number, output: number } }
//   or { error: string } with an appropriate HTTP status.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const MAX_RANGE_DAYS = 365
const DEFAULT_RANGE_DAYS = 60

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  // ---- auth ----
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'missing bearer token' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'function misconfigured: missing Supabase env' }, 500)
  }
  if (!geminiKey) {
    return jsonResponse({ error: 'function misconfigured: missing GEMINI_API_KEY secret' }, 500)
  }

  // The user's JWT is forwarded so PostgREST applies RLS as that user.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'invalid session' }, 401)
  }

  // ---- request body ----
  let body: { babyId?: string; rangeDays?: number; messages?: ChatMsg[] }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400)
  }

  const babyId = body.babyId
  const rangeDays = clamp(body.rangeDays ?? DEFAULT_RANGE_DAYS, 7, MAX_RANGE_DAYS)
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!babyId) return jsonResponse({ error: 'babyId required' }, 400)
  if (messages.length === 0) return jsonResponse({ error: 'messages required' }, 400)

  // ---- fetch data (RLS enforced via user JWT) ----
  const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString()

  const [babyRes, weightsRes, feedsRes, diapersRes, pumpsRes, supplementsRes] =
    await Promise.all([
      supabase.from('babies').select('*').eq('id', babyId).maybeSingle(),
      // Weights are sparse and important for growth context — pull all of them
      // regardless of rangeDays. There aren't enough rows for it to matter.
      supabase
        .from('weights')
        .select('*')
        .eq('baby_id', babyId)
        .order('measured_at', { ascending: true }),
      supabase
        .from('feeds')
        .select('*')
        .eq('baby_id', babyId)
        .gte('fed_at', since)
        .order('fed_at', { ascending: true }),
      supabase
        .from('diapers')
        .select('*')
        .eq('baby_id', babyId)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: true }),
      supabase
        .from('pumps')
        .select('*')
        .eq('baby_id', babyId)
        .gte('pumped_at', since)
        .order('pumped_at', { ascending: true }),
      supabase
        .from('supplements')
        .select('*')
        .eq('baby_id', babyId)
        .gte('given_at', since)
        .order('given_at', { ascending: true }),
    ])

  for (const r of [babyRes, weightsRes, feedsRes, diapersRes, pumpsRes, supplementsRes]) {
    if (r.error) {
      return jsonResponse(
        { error: `failed to load data: ${r.error.message}` },
        500,
      )
    }
  }

  if (!babyRes.data) {
    return jsonResponse({ error: 'baby not found or not accessible' }, 404)
  }

  // ---- build the system prompt ----
  const systemPrompt = buildSystemPrompt({
    baby: babyRes.data,
    weights: weightsRes.data ?? [],
    feeds: feedsRes.data ?? [],
    diapers: diapersRes.data ?? [],
    pumps: pumpsRes.data ?? [],
    supplements: supplementsRes.data ?? [],
    rangeDays,
  })

  // ---- call Gemini ----
  // We pass the system prompt via systemInstruction (kept separate from the
  // chat history so the model treats it as ground truth, not a turn).
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(geminiKey)}`

  const geminiBody = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      // Gemini 2.5 counts BOTH thinking + visible tokens against
      // maxOutputTokens, so we keep a generous headroom and cap thinking
      // separately. Otherwise dynamic thinking can eat the whole budget on
      // a complex question and the visible reply gets truncated mid-word.
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 1024 },
    },
    safetySettings: [
      // Baby-data analysis can include words like "weight", "feeding",
      // "blood", etc. Loosen the defaults so legitimate questions don't
      // get blocked.
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const geminiResp = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  })

  if (!geminiResp.ok) {
    const errText = await geminiResp.text()
    return jsonResponse(
      { error: `Gemini API error (${geminiResp.status}): ${errText.slice(0, 500)}` },
      502,
    )
  }

  const geminiData = await geminiResp.json()
  const candidate = geminiData?.candidates?.[0]
  const reply = candidate?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
  if (!reply) {
    return jsonResponse(
      { error: 'Gemini returned no content', detail: geminiData },
      502,
    )
  }

  return jsonResponse({
    reply,
    model: GEMINI_MODEL,
    finishReason: candidate?.finishReason ?? null,
    tokens: {
      prompt: geminiData?.usageMetadata?.promptTokenCount ?? null,
      // candidatesTokenCount is visible-reply tokens only; thinking is
      // tracked separately under thoughtsTokenCount on Gemini 2.5.
      output: geminiData?.usageMetadata?.candidatesTokenCount ?? null,
      thinking: geminiData?.usageMetadata?.thoughtsTokenCount ?? null,
    },
  })
})

// ---------- helpers ----------

function clamp(n: number, min: number, max: number) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

interface BuildArgs {
  baby: any
  weights: any[]
  feeds: any[]
  diapers: any[]
  pumps: any[]
  supplements: any[]
  rangeDays: number
}

function buildSystemPrompt({
  baby,
  weights,
  feeds,
  diapers,
  pumps,
  supplements,
  rangeDays,
}: BuildArgs): string {
  const today = new Date().toISOString().slice(0, 10)
  const ageDays = baby.birthday
    ? Math.floor((Date.now() - new Date(baby.birthday).getTime()) / 86_400_000)
    : null

  const gaWeeks = baby.gestational_age_weeks ?? null
  const gaDays = baby.gestational_age_days ?? null
  const correctedAgeDays =
    ageDays != null && gaWeeks != null
      ? ageDays - (40 * 7 - (gaWeeks * 7 + (gaDays ?? 0)))
      : null

  const meta = {
    name: baby.name,
    sex: baby.sex,
    birthday: baby.birthday,
    today,
    age_days: ageDays,
    age_weeks: ageDays != null ? +(ageDays / 7).toFixed(1) : null,
    gestational_age_at_birth:
      gaWeeks != null ? `${gaWeeks}w ${gaDays ?? 0}d` : 'term (assumed)',
    corrected_age_days: correctedAgeDays,
    breast_ml_per_min: baby.breast_ml_per_min ?? 8,
    range_days: rangeDays,
  }

  const counts = {
    weights: weights.length,
    feeds: feeds.length,
    diapers: diapers.length,
    pumps: pumps.length,
    supplements: supplements.length,
  }

  // Compact, line-oriented serialization keeps Gemini fast and the token
  // count low. Each row is one line of TSV-ish key=value pairs.
  const weightsSection = weights
    .map(
      (w) =>
        `${w.measured_at.slice(0, 10)}  ${num(w.weight_kg, 3)} kg` +
        (w.notes ? `  // ${oneLine(w.notes)}` : ''),
    )
    .join('\n')

  const feedsSection = feeds
    .map((f) => {
      const t = f.fed_at.replace('T', ' ').slice(0, 16)
      if (f.type === 'bottle') {
        return `${t}  bottle  ${num(f.amount_ml, 0)} mL` + notesSuffix(f.notes)
      }
      return (
        `${t}  breast  ${num(f.duration_min, 0)} min` +
        (f.side ? ` (${f.side})` : '') +
        notesSuffix(f.notes)
      )
    })
    .join('\n')

  const pumpsSection = pumps
    .map((p) => {
      const t = p.pumped_at.replace('T', ' ').slice(0, 16)
      const lr =
        p.left_ml != null || p.right_ml != null
          ? ` L=${num(p.left_ml, 0)} R=${num(p.right_ml, 0)}`
          : ''
      const dur = p.duration_min != null ? `  ${num(p.duration_min, 0)} min` : ''
      return (
        `${t}  pump (${p.side})  ${num(p.amount_ml, 0)} mL${lr}${dur}` +
        notesSuffix(p.notes)
      )
    })
    .join('\n')

  const diapersSection = diapers
    .map((d) => {
      const t = d.occurred_at.replace('T', ' ').slice(0, 16)
      return `${t}  ${d.type}` + notesSuffix(d.notes)
    })
    .join('\n')

  const supplementsSection = supplements
    .map((s) => {
      const t = s.given_at.replace('T', ' ').slice(0, 16)
      const what = [s.multivitamin && 'multivitamin', s.iron && 'iron']
        .filter(Boolean)
        .join(' + ')
      return `${t}  ${what}` + notesSuffix(s.notes)
    })
    .join('\n')

  return `You are a careful, conversational baby-data analyst. You are talking directly to ${baby.name}'s parents — address them as "you" / "your". Never refer to them in the third person ("the parents", "Sam's parents", etc.). Help them make sense of their tracking logs.

Be concise and concrete: cite specific numbers and dates from the data, surface trends and outliers, and call out when there isn't enough data to answer.

Output style:
- Use short Markdown: small headings only when needed, bullet lists, **bold** for key numbers.
- Always quote real numbers from the data; never invent values.
- When asked for averages or trends, also state the window (e.g. "last 7 days") and show how many entries it spans.
- For weight questions, reference the WHO percentile context if relevant (the app already plots WHO bands so you understand percentiles). Acknowledge the corrected gestational age when discussing growth.
- If a question can't be answered from the data (e.g. "is this normal medically?"), say so, suggest the closest measurable thing in the data, and recommend asking your pediatrician.
- Never give medical diagnosis or dosing advice.

# Baby
${JSON.stringify(meta, null, 2)}

# Counts in window
${JSON.stringify(counts, null, 2)}

# Weights (all-time, ascending)
${weightsSection || '(no weights)'}

# Feeds (last ${rangeDays} days, ascending)
${feedsSection || '(no feeds)'}

# Pumps (last ${rangeDays} days, ascending)
${pumpsSection || '(no pumps)'}

# Diapers (last ${rangeDays} days, ascending)
${diapersSection || '(no diapers)'}

# Supplements (last ${rangeDays} days, ascending)
${supplementsSection || '(no supplements)'}
`
}

function num(v: number | null | undefined, digits: number): string {
  if (v == null) return '-'
  return Number(v).toFixed(digits)
}

function oneLine(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/\s+/g, ' ').trim().slice(0, 120)
}

function notesSuffix(s: string | null | undefined): string {
  const t = oneLine(s)
  return t ? `  // ${t}` : ''
}
