import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Sparkles, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../lib/supabase'
import type { Baby } from '../lib/types'

type Range = '14d' | '30d' | '60d' | '90d' | '365d'
type Mode = 'fast' | 'deep'

const RANGES: { id: Range; label: string; days: number }[] = [
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
  { id: '60d', label: '60 d', days: 60 },
  { id: '90d', label: '90 d', days: 90 },
  { id: '365d', label: '1 yr', days: 365 },
]

// Bump this whenever we want to reset everyone's saved preference to the
// new default (currently 'fast').
const MODE_PREF_KEY = 'spt-ask-mode-v2'

const SUGGESTIONS: string[] = [
  'When are the cluster feeding times based on the past 14 days?',
  "Did we miss any vitamins or iron in the past 7 days?",
  'How has L vs R pump output asymmetry changed over time?',
]

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  // Optional metadata surfaced in the UI but not sent back to the model.
  meta?: {
    tokensIn?: number | null
    tokensOut?: number | null
    tokensThinking?: number | null
    model?: string
    mode?: Mode
    finishReason?: string | null
  }
}

const STORAGE_KEY_PREFIX = 'spt-ask-history-v1:'

export function AskView({ baby }: { baby: Baby }) {
  const [range, setRange] = useState<Range>('60d')
  const [mode, setMode] = useState<Mode>(() => loadModePref())
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory(baby.id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const days = RANGES.find((r) => r.id === range)!.days

  // Persist the mode preference globally (not per-baby) — most folks pick
  // one tradeoff and stick with it.
  useEffect(() => {
    try {
      localStorage.setItem(MODE_PREF_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  // Persist conversation per-baby so a tab switch doesn't blow it away.
  useEffect(() => {
    saveHistory(baby.id, messages)
  }, [baby.id, messages])

  // Reset draft + scroll when changing babies.
  useEffect(() => {
    setMessages(loadHistory(baby.id))
  }, [baby.id])

  // Autoscroll to bottom on new messages / while streaming the next reply.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, submitting])

  const canSend = draft.trim().length > 0 && !submitting

  async function send(prompt?: string) {
    const text = (prompt ?? draft).trim()
    if (!text || submitting) return

    setError(null)
    const userTurn: ChatMsg = { role: 'user', content: text }
    const next: ChatMsg[] = [...messages, userTurn]
    // Add an empty assistant bubble we'll mutate in place as chunks arrive.
    const assistantIdx = next.length
    setMessages([...next, { role: 'assistant', content: '' }])
    setDraft('')
    setSubmitting(true)

    try {
      const { reply, meta } = await streamAsk({
        babyId: baby.id,
        rangeDays: days,
        mode,
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        onChunk: (delta) => {
          // Functional update so we don't depend on a stale `messages` ref.
          setMessages((prev) => {
            const copy = prev.slice()
            const cur = copy[assistantIdx]
            if (!cur || cur.role !== 'assistant') return prev
            copy[assistantIdx] = { ...cur, content: cur.content + delta }
            return copy
          })
        },
      })

      // Finalize: stamp meta + ensure the saved content matches the full
      // reply (in case the streaming-state ref above missed a final chunk).
      setMessages((prev) => {
        const copy = prev.slice()
        copy[assistantIdx] = {
          role: 'assistant',
          content: reply || copy[assistantIdx]?.content || '',
          meta,
        }
        return copy
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      // Roll back the optimistic user + empty assistant turns so retry is easy.
      setMessages(messages)
      setDraft(text)
    } finally {
      setSubmitting(false)
      // Refocus so a phone keyboard stays up for follow-ups.
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  function clearChat() {
    setMessages([])
    setError(null)
    saveHistory(baby.id, [])
  }

  const visibleSuggestions = useMemo(
    () => (messages.length === 0 ? SUGGESTIONS : SUGGESTIONS.slice(0, 3)),
    [messages.length],
  )

  return (
    <div className="space-y-3">
      <section className="card p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-brand-600 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-700 truncate">
              Ask about {baby.name}'s data
            </h2>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="btn-ghost text-xs text-slate-500"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 shrink-0">Window</span>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 font-medium ${
                  range === r.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500 shrink-0 ml-1">Mode</span>
          <div
            className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs"
            role="tablist"
            aria-label="Reasoning mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'fast'}
              onClick={() => setMode('fast')}
              className={`px-2.5 py-1 font-medium ${
                mode === 'fast' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
              }`}
              title="No reasoning step — instant, cheapest, great for simple lookups"
            >
              Fast
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'deep'}
              onClick={() => setMode('deep')}
              className={`px-2.5 py-1 font-medium ${
                mode === 'deep' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
              }`}
              title="Adds bounded reasoning — better for trends, comparisons, outlier hunting"
            >
              Deep
            </button>
          </div>
        </div>
      </section>

      <div
        ref={scrollRef}
        className="card p-3 min-h-[280px] max-h-[60vh] overflow-y-auto space-y-3"
      >
        {messages.length === 0 && !submitting && (
          <div className="text-center py-6 text-sm text-slate-500 space-y-3">
            <Sparkles className="h-6 w-6 mx-auto text-brand-500" />
            <div>Ask anything about the data — I have full access to the logs.</div>
          </div>
        )}

        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const isLiveAssistant =
            submitting && isLast && m.role === 'assistant' && m.content === ''
          return <Bubble key={i} msg={m} pending={isLiveAssistant} />
        })}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs px-3 py-2">
            <div className="font-medium">Couldn't reach Gemini</div>
            <div className="opacity-80 break-words">{error}</div>
          </div>
        )}
      </div>

      {visibleSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={submitting}
              className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSend) void send()
        }}
        className="card p-2 flex items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) void send()
            }
          }}
          placeholder={`Ask about ${baby.name}'s data…`}
          rows={1}
          className="input resize-none min-h-[40px] max-h-32"
          aria-label="Question"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="btn-primary h-10 w-10 p-0 grid place-items-center disabled:opacity-50"
          aria-label="Send"
          title="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

function Bubble({ msg, pending = false }: { msg: ChatMsg; pending?: boolean }) {
  const isUser = msg.role === 'user'
  const truncated =
    !isUser && msg.meta?.finishReason && msg.meta.finishReason !== 'STOP'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-brand-600 text-white rounded-br-md'
            : 'bg-slate-100 text-slate-800 rounded-bl-md'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        ) : pending ? (
          <div className="flex items-center gap-1 py-0.5" aria-label="thinking">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:120ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:240ms]" />
          </div>
        ) : (
          <div className="markdown-body break-words">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
        {truncated && (
          <div className="text-[11px] text-amber-700 mt-1.5 italic">
            Response was cut off ({msg.meta?.finishReason}). Ask a follow-up to
            continue, or try a smaller window.
          </div>
        )}
        {!isUser && msg.meta?.tokensIn != null && (
          <div className="text-[10px] text-slate-400 mt-1">
            {msg.meta.model}
            {msg.meta.mode ? ` · ${msg.meta.mode}` : ''} · {msg.meta.tokensIn} in
            · {msg.meta.tokensOut} out
            {msg.meta.tokensThinking ? ` · ${msg.meta.tokensThinking} thinking` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- streaming transport ---------------------------------------------------

interface StreamArgs {
  babyId: string
  rangeDays: number
  mode: Mode
  messages: { role: 'user' | 'assistant'; content: string }[]
  onChunk: (text: string) => void
}

interface StreamResult {
  reply: string
  meta: ChatMsg['meta']
}

// Stream the `ask` edge function. We bypass `supabase.functions.invoke` here
// because it always buffers the response body before resolving — which
// defeats the whole point. Instead we hit the function URL directly with the
// session JWT and consume the SSE byte stream as it arrives.
async function streamAsk({
  babyId,
  rangeDays,
  mode,
  messages,
  onChunk,
}: StreamArgs): Promise<StreamResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase env vars are not configured')
  }
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) throw new Error(sessionErr.message)
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Not signed in')

  const resp = await fetch(`${supabaseUrl}/functions/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      babyId,
      rangeDays,
      mode,
      stream: true,
      messages,
    }),
  })

  if (!resp.ok || !resp.body) {
    // Auth / validation / upstream-connect errors come back as JSON; surface
    // their `error` message verbatim so the user sees the real reason.
    let detail = ''
    try {
      const j = await resp.json()
      detail = j?.error ?? JSON.stringify(j)
    } catch {
      detail = await resp.text().catch(() => '')
    }
    throw new Error(detail || `Edge function returned HTTP ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''
  let meta: ChatMsg['meta'] = {}
  let streamError: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.replace(/\r\n/g, '\n').split('\n\n')
      buffer = events.pop() ?? ''
      for (const ev of events) {
        for (const line of ev.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          let payload:
            | { type: 'chunk'; text: string }
            | {
                type: 'done'
                model?: string
                mode?: Mode
                finishReason?: string | null
                tokens?: {
                  prompt?: number | null
                  output?: number | null
                  thinking?: number | null
                }
              }
            | { type: 'error'; error: string }
          try {
            payload = JSON.parse(data)
          } catch {
            continue
          }
          if (payload.type === 'chunk') {
            reply += payload.text
            onChunk(payload.text)
          } else if (payload.type === 'done') {
            meta = {
              model: payload.model,
              mode: payload.mode,
              finishReason: payload.finishReason ?? null,
              tokensIn: payload.tokens?.prompt ?? null,
              tokensOut: payload.tokens?.output ?? null,
              tokensThinking: payload.tokens?.thinking ?? null,
            }
          } else if (payload.type === 'error') {
            streamError = payload.error
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (streamError && !reply) throw new Error(streamError)
  if (!reply) throw new Error('Empty reply')
  return { reply, meta }
}

function loadModePref(): Mode {
  if (typeof localStorage === 'undefined') return 'fast'
  try {
    const v = localStorage.getItem(MODE_PREF_KEY)
    return v === 'deep' ? 'deep' : 'fast'
  } catch {
    return 'fast'
  }
}

function loadHistory(babyId: string): ChatMsg[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + babyId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMsg[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m) =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
  } catch {
    return []
  }
}

function saveHistory(babyId: string, messages: ChatMsg[]) {
  if (typeof localStorage === 'undefined') return
  try {
    if (messages.length === 0) {
      localStorage.removeItem(STORAGE_KEY_PREFIX + babyId)
    } else {
      localStorage.setItem(STORAGE_KEY_PREFIX + babyId, JSON.stringify(messages))
    }
  } catch {
    // Quota / private mode — fine to swallow.
  }
}
