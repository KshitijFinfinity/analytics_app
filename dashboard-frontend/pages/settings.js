export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Dashboard-level settings and configuration placeholders.</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg font-semibold">General</h2>
          <p className="mt-2 text-sm text-slate-600">Environment: Local development</p>
          <p className="text-sm text-slate-600">Analytics API: http://localhost:4001</p>
          <p className="text-sm text-slate-600">Website app: http://localhost:3000</p>
          <p className="text-sm text-slate-600">Dashboard app: http://localhost:3001</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg font-semibold">Data Retention</h2>
          <p className="mt-2 text-sm text-slate-600">Configure cleanup policies in backend services as needed.</p>
        </article>
      </section>
    </div>
  );
}
