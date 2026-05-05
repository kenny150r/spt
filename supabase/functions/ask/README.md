# `ask` edge function

Proxies the in-app **Ask** view through to either Google's Gemini API or
OpenAI's Chat Completions API (selectable per-deploy). Lives at
`/functions/v1/ask` after deploy. The function:

1. Reads the user's Supabase access token from the `Authorization: Bearer …`
   header that the app's `supabase.functions.invoke('ask', …)` call
   automatically attaches.
2. Uses that token to load `babies / weights / feeds / diapers / pumps /
   supplements` rows for the requested `babyId`. Row Level Security still
   applies, so users can only see their own data.
3. Builds a compact, one-line-per-row context block plus a system
   instruction.
4. Calls the selected provider with a server-only API key.
5. Returns `{ reply, model, mode, finishReason, tokens }` to the client.

The provider's API key never reaches the browser.

## One-time setup

Install the Supabase CLI if you haven't:

```bash
brew install supabase/tap/supabase
```

Log in and link this repo to your Supabase project. The project ref is the
subdomain in `VITE_SUPABASE_URL` (e.g. `ebdlvmtqzruqxunpshbx` for
`https://ebdlvmtqzruqxunpshbx.supabase.co`):

```bash
supabase login                       # opens a browser
supabase link --project-ref <ref>    # creates supabase/.temp etc.
```

Choose a provider and store its API key as a project secret (server-side
only — never exposed in the bundled JS):

### Gemini (free tier)

```bash
# https://aistudio.google.com/apikey — no credit card required
supabase secrets set GEMINI_API_KEY=AIzaSy...
supabase secrets set LLM_PROVIDER=gemini  # optional; auto-detected
```

### OpenAI (paid, but cheap)

OpenAI does not have a free tier. You'll need a paid account with usage
billing turned on at <https://platform.openai.com/billing>. Pricing is
roughly half a cent per question with the default models on this app's
context size — but watch your usage if you're paranoid.

```bash
# https://platform.openai.com/api-keys
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set LLM_PROVIDER=openai
```

If both keys are set and `LLM_PROVIDER` is _not_ explicitly set, the
function prefers OpenAI (since you'd only set its key on purpose). To
switch back without unsetting either key:

```bash
supabase secrets set LLM_PROVIDER=gemini
supabase functions deploy ask   # redeploy to pick up new secrets
```

Deploy the function:

```bash
supabase functions deploy ask
```

That's it — the **Ask** tab in the app should start working immediately.

## Switching models

Each provider exposes its own model env vars; defaults are listed below.

| env var               | default          | used for                |
| --------------------- | ---------------- | ----------------------- |
| `GEMINI_MODEL`        | `gemini-2.5-flash` | both fast + deep (thinking budget toggles) |
| `OPENAI_FAST_MODEL`   | `gpt-4o-mini`    | OpenAI mode=fast         |
| `OPENAI_DEEP_MODEL`   | `gpt-5-mini`     | OpenAI mode=deep (reasoning) |

Examples:

```bash
supabase secrets set GEMINI_MODEL=gemini-2.5-pro      # paid Gemini account only
supabase secrets set OPENAI_FAST_MODEL=gpt-4.1-mini   # try a different fast model
supabase secrets set OPENAI_DEEP_MODEL=o4-mini        # cheaper reasoning option
supabase functions deploy ask
```

The function automatically uses the right OpenAI request shape for each
model: non-reasoning models (`gpt-4o*`, `gpt-4.1*`) get `temperature` and
`max_tokens`; reasoning models (`o-series`, `gpt-5*`) get
`reasoning_effort` and `max_completion_tokens` instead.

## Iterating locally

```bash
supabase functions serve ask --env-file ./supabase/functions/ask/.env.local
```

Create `supabase/functions/ask/.env.local` (gitignored) with one or both
provider keys:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
LLM_PROVIDER=openai           # or "gemini"
OPENAI_API_KEY=sk-...         # required if LLM_PROVIDER=openai
GEMINI_API_KEY=AIzaSy...      # required if LLM_PROVIDER=gemini
```

The dev server runs on `http://localhost:54321/functions/v1/ask`. Point the
app at it by setting `VITE_SUPABASE_URL=http://localhost:54321` if you want
to test end-to-end (otherwise the Vite dev server will keep hitting the
deployed function).

## Logs / debugging

```bash
supabase functions logs ask --tail
```

The most common failure modes:

- `no LLM key configured: …` — set `OPENAI_API_KEY` or `GEMINI_API_KEY`.
- `LLM_PROVIDER=openai but OPENAI_API_KEY is not set` — set the matching key
  (or unset `LLM_PROVIDER` to auto-pick).
- `Gemini API error (429): …` — free-tier rate limit (15 RPM / 1500 RPD on
  Flash). Wait or upgrade.
- `Gemini returned no content` with `finishReason: SAFETY` — Gemini's
  safety filters fired. The function already turns the four category
  thresholds down to `BLOCK_NONE` for medical-adjacent vocabulary, so this
  is rare; if it happens, paraphrase the question.
- `OpenAI API error (401): …` — your `OPENAI_API_KEY` is invalid or
  revoked.
- `OpenAI API error (429): rate_limit_exceeded` — you've hit OpenAI's TPM
  rate limit; the default tier-1 budget is plenty for personal use, just
  retry. If `insufficient_quota` instead, top up your account balance at
  <https://platform.openai.com/billing>.
