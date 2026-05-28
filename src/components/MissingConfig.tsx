export function MissingConfig() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-md card p-8">
        <h1 className="text-xl font-semibold mb-3">Supabase isn't configured yet</h1>
        <p className="text-sm text-slate-600 mb-4 dark:text-slate-300">
          To get started, create a Supabase project and add its URL and anon key to a
          <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">.env</code>
          file at the project root.
        </p>
        <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto dark:bg-slate-950 dark:border dark:border-slate-800">
{`VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="text-sm text-slate-600 mt-4 dark:text-slate-300">
          Then run the SQL in <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 dark:text-slate-100">supabase/schema.sql</code> in your project's SQL editor and restart the dev server.
        </p>
      </div>
    </div>
  )
}
