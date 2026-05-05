# `ask` edge function

Proxies the in-app **Ask** view through to Google's Gemini API. Lives at
`/functions/v1/ask` after deploy. The function:

1. Reads the user's Supabase access token from the `Authorization: Bearer …`
   header that the app's `supabase.functions.invoke('ask', …)` call
   automatically attaches.
2. Uses that token to load `babies / weights / feeds / diapers / pumps /
   supplements` rows for the requested `babyId`. Row Level Security still
   applies, so users can only see their own data.
3. Builds a compact, one-line-per-row context block plus a system
   instruction.
4. Calls `https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent`
   using a server-only `GEMINI_API_KEY` secret.
5. Returns `{ reply, model, tokens }` to the client.

The Gemini API key never reaches the browser.

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

Get a free Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey) and store it as a
project secret (server-side only — it is _never_ exposed in the bundled
JS):

```bash
supabase secrets set GEMINI_API_KEY=AIzaSy...
```

Deploy the function:

```bash
supabase functions deploy ask
```

That's it — the **Ask** tab in the app should start working immediately.

## Switching models

The function defaults to `gemini-2.5-flash`. Override with another secret:

```bash
supabase secrets set GEMINI_MODEL=gemini-2.5-pro
```

(`flash` is plenty for this and stays well inside the free tier; only swap
to `pro` if you have a paid Cloud account configured.)

## Iterating locally

```bash
supabase functions serve ask --env-file ./supabase/functions/ask/.env.local
```

Create `supabase/functions/ask/.env.local` (gitignored) with:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
GEMINI_API_KEY=<your-key>
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

- `function misconfigured: missing GEMINI_API_KEY secret` — you forgot
  `supabase secrets set GEMINI_API_KEY=…`.
- `Gemini API error (429): …` — free-tier rate limit (15 RPM / 1500 RPD on
  Flash). Wait or upgrade.
- `Gemini returned no content` with `finishReason: SAFETY` in the detail —
  Gemini's safety filters fired. The function already turns the four
  category thresholds down to `BLOCK_NONE` for medical-adjacent vocabulary,
  so this is rare; if it happens, paraphrase the question.
