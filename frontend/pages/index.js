import Link from "next/link";
import Card from "@/components/Card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

export default function Home() {
  usePageTracking("home");

  function triggerFrontendError() {
    trackEvent("frontend_error_test_clicked", { source: "home" });

    window.setTimeout(() => {
      throw new Error("Intentional frontend test error from demo website");
    }, 0);
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-12">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />

        <div className="relative max-w-3xl">
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Smart Lending Platform
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl md:text-6xl">
            Approvals that move at the speed of your ambition.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            FluxLend gives modern borrowers instant pre-checks, structured loan applications, and clear
            repayment visibility across every step.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Approval Time</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">Under 18 mins</p>
            </div>
            <div className="glass-panel rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drop-off Reduction</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">32% better</p>
            </div>
            <div className="glass-panel rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Journey Coverage</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">End-to-end tracked</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/signup"
              onClick={() => trackEvent("home_cta_click", { cta: "get_started" })}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              onClick={() => trackEvent("home_cta_click", { cta: "existing_user_login" })}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              I Already Have an Account
            </Link>
            <button
              type="button"
              onClick={triggerFrontendError}
              className="rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Trigger Frontend Error
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card title="3 Min Onboarding" subtitle="Create profile and verify intent quickly.">
          <p className="text-sm text-slate-600">Low-friction signup and guided steps reduce drop-off.</p>
        </Card>
        <Card title="Insightful Dashboard" subtitle="Review loan health in one place.">
          <p className="text-sm text-slate-600">Track active loans, offers, and upcoming EMIs.</p>
        </Card>
        <Card title="Guided Application" subtitle="Multi-step journey built for analytics.">
          <p className="text-sm text-slate-600">Capture step events to inspect funnel completion trends.</p>
        </Card>
      </section>

      <section className="glass-panel rounded-3xl p-6 text-center shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-slate-900">Ready to run the full loan funnel?</h2>
        <p className="mt-2 text-slate-600">Start with signup and walk through the complete product journey.</p>
        <div className="mt-5">
          <Link
            href="/signup"
            onClick={() => trackEvent("signup_started", { source: "home_bottom_cta" })}
            className="inline-flex rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Start Signup Flow
          </Link>
        </div>
      </section>
    </div>
  );
}
