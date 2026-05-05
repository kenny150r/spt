import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Sparkles, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../lib/supabase'
import type { Baby } from '../lib/types'

type Range = '14d' | '30d' | '60d' | '90d' | '365d'

const RANGES: { id: Range; label: string; days: number }[] = [
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
  { id: '60d', label: '60 d', days: 60 },
  { id: '90d', label: '90 d', days: 90 },
  { id: '365d', label: '1 yr', days: 365 },
]

const SUGGESTIONS: string[] = [
  'How is the weight trending vs the WHO 50th percentile?',
  "What's the average pump output the past week vs the week before?",
  "Are there any unusually long gaps between feeds?",
  'What was the longest stretch without a wet diaper?',
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
    finishReason?: string | null
  }
}

const STORAGE_KEY_PREFIX = 'spt-ask-history-v1:'

export function AskView({ baby }: { baby: Baby }) {
  const [range, setRange] = useState<Range>('60d')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory(baby.id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const days = RANGES.find((r) => r.id === range)!.days

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
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setDraft('')
    setSubmitting(true)

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('ask', {
        body: {
          babyId: baby.id,
          rangeDays: days,
          // Only send role + content; the meta block is UI-only.
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        },
      })
      if (invokeErr) {
        throw new Error(invokeErr.message ?? 'Edge function call failed')
      }
      const reply = data as
        | {
            reply?: string
            model?: string
            finishReason?: string | null
            tokens?: { prompt?: number; output?: number; thinking?: number }
          }
        | null
      if (!reply?.reply) {
        const errMsg = (data as { error?: string } | null)?.error ?? 'Empty reply from Gemini'
        throw new Error(errMsg)
      }
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: reply.reply,
          meta: {
            model: reply.model,
            tokensIn: reply.tokens?.prompt ?? null,
            tokensOut: reply.tokens?.output ?? null,
            tokensThinking: reply.tokens?.thinking ?? null,
            finishReason: reply.finishReason ?? null,
          },
        },
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      // Roll back the optimistic user turn on hard failure so retry is easy.
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 shrink-0">Window:</span>
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
        </div>
        <p className="text-[11px] text-slate-400 mt-2 leading-snug">
          Sends weights (all time) plus the last {days} days of feeds, pumps,
          diapers, and supplements to Gemini through your Supabase Edge
          Function. Don't paste anything you wouldn't share with Google.
        </p>
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

        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}

        {submitting && (
          <div className="flex items-center gap-2 text-sm text-slate-400 px-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:120ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:240ms]" />
            <span className="ml-1">thinking…</span>
          </div>
        )}

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

function Bubble({ msg }: { msg: ChatMsg }) {
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
            {msg.meta.model} · {msg.meta.tokensIn} in · {msg.meta.tokensOut} out
            {msg.meta.tokensThinking ? ` · ${msg.meta.tokensThinking} thinking` : ''}
          </div>
        )}
      </div>
    </div>
  )
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
