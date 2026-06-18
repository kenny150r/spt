// Edge Function: /functions/v1/ask
//
// Proxies user questions about their baby data to a chosen LLM provider
// (Gemini or OpenAI). The API key lives only as a Supabase secret so it
// never touches the client. Each request must carry the user's Supabase
// access token; the function uses that token to read data via PostgREST,
// which keeps Row Level Security in force end-to-end.
//
// Provider selection (env vars / Supabase secrets):
//   LLM_PROVIDER  = "gemini" (default) | "openai"
//   GEMINI_API_KEY     - required when provider=gemini
//   OPENAI_API_KEY     - required when provider=openai
//
//   GEMINI_MODEL       - override the Gemini model (default: gemini-2.5-flash)
//   OPENAI_FAST_MODEL  - non-reasoning model used for mode=fast (default: gpt-4o-mini)
//   OPENAI_DEEP_MODEL  - reasoning model used for mode=deep (default: gpt-5-mini)
//
// If neither LLM_PROVIDER nor a matching key is configured we fall back to
// whichever provider has its key set (so just running
// `supabase secrets set OPENAI_API_KEY=...` is enough to switch).
//
// Deploy:
//   supabase functions deploy ask
//   supabase secrets set OPENAI_API_KEY=sk-... LLM_PROVIDER=openai
//
// Request body:
//   { babyId: string, rangeDays?: number, mode?: 'fast'|'deep',
//     stream?: boolean, messages: ChatMsg[] }
//
// Response body (stream=false, default):
//   { reply: string, model: string, mode: 'fast'|'deep', finishReason: string,
//     tokens: { prompt, output, thinking } }
//   or { error: string } with an appropriate HTTP status.
//
// Response body (stream=true):
//   text/event-stream of `data: {json}\n\n` events with shapes
//     { type: 'chunk', text: string }                        // partial reply
//     { type: 'done', model, mode, finishReason, tokens }     // terminal
//     { type: 'error', error: string }                        // mid-stream fail
//   The HTTP status is 200 once streaming starts; auth/validation failures
//   still return JSON with the appropriate non-200 status.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

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

type Provider = 'gemini' | 'openai'
type Mode = 'fast' | 'deep'

interface NormalizedReply {
  reply: string
  model: string
  finishReason: string | null
  tokens: {
    prompt: number | null
    output: number | null
    thinking: number | null
  }
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
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'function misconfigured: missing Supabase env' }, 500)
  }

  const provider = resolveProvider()
  if (!provider.ok) return jsonResponse({ error: provider.error }, 500)

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
  let body: {
    babyId?: string
    rangeDays?: number
    messages?: ChatMsg[]
    mode?: Mode
    stream?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400)
  }

  const babyId = body.babyId
  const rangeDays = clamp(body.rangeDays ?? DEFAULT_RANGE_DAYS, 7, MAX_RANGE_DAYS)
  const messages = Array.isArray(body.messages) ? body.messages : []
  const mode: Mode = body.mode === 'deep' ? 'deep' : 'fast'
  const stream = body.stream === true
  if (!babyId) return jsonResponse({ error: 'babyId required' }, 400)
  if (messages.length === 0) return jsonResponse({ error: 'messages required' }, 400)

  // ---- fetch data (RLS enforced via user JWT) ----
  const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString()

  const [babyRes, weightsRes, feedsRes, diapersRes, pumpsRes, supplementsRes] =
    await Promise.all([
      supabase.from('babies').select('*').eq('id', babyId).maybeSingle(),
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

  // ---- call the LLM ----
  const args: ProviderArgs = { apiKey: provider.key, mode, systemPrompt, messages }

  if (stream) {
    // For streaming we want to surface upstream connect errors as a
    // proper non-200 JSON response so the client can show a useful
    // toast; once the stream is open it's too late, so any error from
    // there on is delivered as a `{ type: 'error' }` SSE event.
    try {
      return provider.name === 'openai'
        ? await streamOpenAI(args, mode)
        : await streamGemini(args, mode)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'LLM call failed'
      return jsonResponse({ error: msg }, 502)
    }
  }

  try {
    const result =
      provider.name === 'openai'
        ? await callOpenAI(args)
        : await callGemini(args)

    return jsonResponse({
      reply: result.reply,
      model: result.model,
      mode,
      finishReason: result.finishReason,
      tokens: result.tokens,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'LLM call failed'
    return jsonResponse({ error: msg }, 502)
  }
})

// ---------- provider selection ----------

function resolveProvider():
  | { ok: true; name: Provider; key: string }
  | { ok: false; error: string } {
  const declared = (Deno.env.get('LLM_PROVIDER') ?? '').toLowerCase()
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''

  if (declared === 'openai') {
    if (!openaiKey) {
      return { ok: false, error: 'LLM_PROVIDER=openai but OPENAI_API_KEY is not set' }
    }
    return { ok: true, name: 'openai', key: openaiKey }
  }
  if (declared === 'gemini') {
    if (!geminiKey) {
      return { ok: false, error: 'LLM_PROVIDER=gemini but GEMINI_API_KEY is not set' }
    }
    return { ok: true, name: 'gemini', key: geminiKey }
  }
  // No explicit provider — auto-pick based on which key is set. Prefer
  // openai if both are set, since the user has to pay for it and was likely
  // intentional about adding the key.
  if (openaiKey) return { ok: true, name: 'openai', key: openaiKey }
  if (geminiKey) return { ok: true, name: 'gemini', key: geminiKey }
  return {
    ok: false,
    error:
      'no LLM key configured: set OPENAI_API_KEY or GEMINI_API_KEY as a Supabase secret',
  }
}

// ---------- Gemini ----------

interface ProviderArgs {
  apiKey: string
  mode: Mode
  systemPrompt: string
  messages: ChatMsg[]
}

async function callGemini({
  apiKey,
  mode,
  systemPrompt,
  messages,
}: ProviderArgs): Promise<NormalizedReply> {
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const thinkingBudget = mode === 'deep' ? 1024 : 0

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`

  const reqBody = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      // Gemini 2.5 counts BOTH thinking + visible tokens against
      // maxOutputTokens, so keep generous headroom for the visible reply
      // and bound thinking separately.
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gemini API error (${resp.status}): ${text.slice(0, 500)}`)
  }
  const data = await resp.json()
  const candidate = data?.candidates?.[0]
  const reply =
    candidate?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
  if (!reply) {
    throw new Error(`Gemini returned no content (finishReason=${candidate?.finishReason ?? 'unknown'})`)
  }
  return {
    reply,
    model,
    finishReason: candidate?.finishReason ?? null,
    tokens: {
      prompt: data?.usageMetadata?.promptTokenCount ?? null,
      output: data?.usageMetadata?.candidatesTokenCount ?? null,
      thinking: data?.usageMetadata?.thoughtsTokenCount ?? null,
    },
  }
}

// ---------- OpenAI ----------

// Models in OpenAI's "reasoning" family (o-series, gpt-5) reject
// `temperature` and `max_tokens`, expect `max_completion_tokens`, and
// accept `reasoning_effort`. Detect by name prefix so adding a new
// reasoning model later doesn't require a code change.
function isReasoningModel(model: string): boolean {
  return /^(o[134]|gpt-5)/i.test(model)
}

async function callOpenAI({
  apiKey,
  mode,
  systemPrompt,
  messages,
}: ProviderArgs): Promise<NormalizedReply> {
  const fastModel = Deno.env.get('OPENAI_FAST_MODEL') ?? 'gpt-5.4-nano'
  const deepModel = Deno.env.get('OPENAI_DEEP_MODEL') ?? 'gpt-5.5'
  const model = mode === 'deep' ? deepModel : fastModel
  const reasoning = isReasoningModel(model)

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const reqBody: Record<string, unknown> = {
    model,
    messages: chatMessages,
  }
  if (reasoning) {
    reqBody.max_completion_tokens = 8192
    // 'low' on a reasoning model is roughly equivalent to Gemini's
    // thinkingBudget=0 in spirit (cheap, lower latency); 'medium' is the
    // sweet spot for analytical questions.
    reqBody.reasoning_effort = mode === 'deep' ? 'medium' : 'low'
  } else {
    reqBody.temperature = 0.4
    reqBody.max_tokens = 8192
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(reqBody),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI API error (${resp.status}): ${text.slice(0, 500)}`)
  }
  const data = await resp.json()
  const choice = data?.choices?.[0]
  const reply: string = choice?.message?.content ?? ''
  if (!reply) {
    throw new Error(`OpenAI returned no content (finish_reason=${choice?.finish_reason ?? 'unknown'})`)
  }
  // Normalize finish_reason to the upper-case convention the client uses
  // ('STOP', 'LENGTH', 'CONTENT_FILTER', ...).
  const finishReason: string | null = choice?.finish_reason
    ? String(choice.finish_reason).toUpperCase()
    : null
  return {
    reply,
    model,
    finishReason,
    tokens: {
      prompt: data?.usage?.prompt_tokens ?? null,
      output: data?.usage?.completion_tokens ?? null,
      thinking: data?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    },
  }
}

// ---------- streaming ----------

interface StreamMeta {
  finishReason: string | null
  tokens: {
    prompt: number | null
    output: number | null
    thinking: number | null
  }
}

const SSE_HEADERS = {
  ...CORS,
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Hint upstream proxies (Cloudflare, nginx) not to buffer the stream.
  'X-Accel-Buffering': 'no',
}

function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

// Iterate over `data: …\n\n` events from an SSE byte stream, yielding the
// raw JSON payload string for each (skipping `[DONE]`, comments, blanks).
async function* iterSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line. Both servers we talk to
      // use \n\n, but be tolerant of \r\n\r\n just in case.
      const normalized = buffer.replace(/\r\n/g, '\n')
      const events = normalized.split('\n\n')
      buffer = events.pop() ?? ''
      for (const ev of events) {
        for (const line of ev.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          yield data
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function streamGemini(
  { apiKey, mode, systemPrompt, messages }: ProviderArgs,
  modeOut: Mode,
): Promise<Response> {
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const thinkingBudget = mode === 'deep' ? 1024 : 0

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(apiKey)}`

  const reqBody = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Gemini API error (${upstream.status}): ${text.slice(0, 500)}`)
  }

  const meta: StreamMeta = {
    finishReason: null,
    tokens: { prompt: null, output: null, thinking: null },
  }

  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const data of iterSseEvents(upstream.body!)) {
          let obj: any
          try {
            obj = JSON.parse(data)
          } catch {
            continue
          }
          const candidate = obj?.candidates?.[0]
          const parts = candidate?.content?.parts ?? []
          let chunkText = ''
          for (const p of parts) {
            // Gemini marks reasoning parts with `thought: true`; skip those
            // so we don't dump chain-of-thought into the chat bubble.
            if (p?.thought) continue
            if (typeof p?.text === 'string') chunkText += p.text
          }
          if (chunkText) {
            controller.enqueue(sseEvent({ type: 'chunk', text: chunkText }))
          }
          if (candidate?.finishReason) meta.finishReason = candidate.finishReason
          if (obj?.usageMetadata) {
            meta.tokens.prompt =
              obj.usageMetadata.promptTokenCount ?? meta.tokens.prompt
            meta.tokens.output =
              obj.usageMetadata.candidatesTokenCount ?? meta.tokens.output
            meta.tokens.thinking =
              obj.usageMetadata.thoughtsTokenCount ?? meta.tokens.thinking
          }
        }
        controller.enqueue(
          sseEvent({ type: 'done', model, mode: modeOut, ...meta }),
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'stream failed'
        controller.enqueue(sseEvent({ type: 'error', error: msg }))
      } finally {
        controller.close()
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {})
    },
  })

  return new Response(out, { status: 200, headers: SSE_HEADERS })
}

async function streamOpenAI(
  { apiKey, mode, systemPrompt, messages }: ProviderArgs,
  modeOut: Mode,
): Promise<Response> {
  const fastModel = Deno.env.get('OPENAI_FAST_MODEL') ?? 'gpt-5.4-nano'
  const deepModel = Deno.env.get('OPENAI_DEEP_MODEL') ?? 'gpt-5.5'
  const model = mode === 'deep' ? deepModel : fastModel
  const reasoning = isReasoningModel(model)

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const reqBody: Record<string, unknown> = {
    model,
    messages: chatMessages,
    stream: true,
    // Without this opt-in OpenAI omits `usage` from streaming responses,
    // and we lose token counts for the meta footer.
    stream_options: { include_usage: true },
  }
  if (reasoning) {
    reqBody.max_completion_tokens = 8192
    reqBody.reasoning_effort = mode === 'deep' ? 'medium' : 'low'
  } else {
    reqBody.temperature = 0.4
    reqBody.max_tokens = 8192
  }

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(reqBody),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`OpenAI API error (${upstream.status}): ${text.slice(0, 500)}`)
  }

  const meta: StreamMeta = {
    finishReason: null,
    tokens: { prompt: null, output: null, thinking: null },
  }

  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const data of iterSseEvents(upstream.body!)) {
          let obj: any
          try {
            obj = JSON.parse(data)
          } catch {
            continue
          }
          const choice = obj?.choices?.[0]
          const delta = choice?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            controller.enqueue(sseEvent({ type: 'chunk', text: delta }))
          }
          if (choice?.finish_reason) {
            meta.finishReason = String(choice.finish_reason).toUpperCase()
          }
          if (obj?.usage) {
            meta.tokens.prompt = obj.usage.prompt_tokens ?? meta.tokens.prompt
            meta.tokens.output =
              obj.usage.completion_tokens ?? meta.tokens.output
            meta.tokens.thinking =
              obj.usage.completion_tokens_details?.reasoning_tokens ??
              meta.tokens.thinking
          }
        }
        controller.enqueue(
          sseEvent({ type: 'done', model, mode: modeOut, ...meta }),
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'stream failed'
        controller.enqueue(sseEvent({ type: 'error', error: msg }))
      } finally {
        controller.close()
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {})
    },
  })

  return new Response(out, { status: 200, headers: SSE_HEADERS })
}

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
      const lr =
        f.left_min != null || f.right_min != null
          ? ` L=${num(f.left_min, 0)} R=${num(f.right_min, 0)}`
          : ''
      return (
        `${t}  breast  ${num(f.duration_min, 0)} min` +
        (f.side ? ` (${f.side})` : '') +
        lr +
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

  return `You are talking directly to ${baby.name}'s parents — address them as "you" / "your". Never refer to them in the third person ("the parents", "Sam's parents", etc.). Help them make sense of their tracking logs.

Be concise and concrete: cite specific numbers and dates from the data, surface trends and outliers, and call out when there isn't enough data to answer.

Output style:
- Use short Markdown: small headings only when needed, bullet lists, **bold** for key numbers.
- Always quote real numbers from the data; never invent values.
- When asked for averages or trends, also state the window (e.g. "last 7 days") and show how many entries it spans.
- For weight questions, reference the WHO percentile context if relevant (the app already plots WHO bands so you understand percentiles). Acknowledge the corrected gestational age when discussing growth.

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
