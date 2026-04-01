import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Card from "@/components/Card";
import EmiCalculator from "@/components/EmiCalculator";
import SupportModal from "@/components/SupportModal";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

const dummyLoans = [
  { id: "LN-1021", amount: "INR 3,50,000", status: "Active", emiDate: "12 Apr 2026" },
  { id: "LN-0933", amount: "INR 1,20,000", status: "Closed", emiDate: "Completed" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendedOffers, setRecommendedOffers] = useState([]);

  usePageTracking("dashboard");

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, loading, router]);

  if (loading || !isAuthenticated) {
    return <p className="text-sm text-slate-600">Loading dashboard...</p>;
  }

  // ...existing code...
      setRecommendedOffers(offers);
      setLoadingRecommendations(false);
      trackEvent("recommendations_loaded", { count: offers.length });
    }, 1800);
  };

  return (
    <div className="space-y-6">
      <Card title={`Hello, ${user?.name || "Borrower"}`} subtitle="Your lending snapshot is ready.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-300">Credit Tier</p>
            <p className="mt-2 text-xl font-semibold">A-</p>
          </div>
          <div className="rounded-xl bg-emerald-500 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-emerald-100">Eligible Limit</p>
            <p className="mt-2 text-xl font-semibold">INR 8,00,000</p>
          </div>
          <div className="rounded-xl bg-cyan-500 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-cyan-100">Pre-approved Offers</p>
            <p className="mt-2 text-xl font-semibold">3</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Analytics Workspace</p>
              <p className="text-sm text-slate-600">Open Funnels, saved charts, and conversion analysis.</p>
            </div>
            <Link
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("navigation_clicked", { destination: "analytics_dashboard" })}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Open Analytics
            </Link>
          </div>
        </div>
      </Card>

      <Card title="Your Loans" subtitle="Dummy data for analytics simulations.">
        <div className="space-y-3">
          {dummyLoans.map((loan) => (
            <div key={loan.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{loan.id}</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {loan.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Amount: {loan.amount}</p>
              <p className="text-sm text-slate-600">Next EMI: {loan.emiDate}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => {
              trackEvent("view_loan_offers_clicked");
              trackEvent("navigation_clicked", { destination: "loan_offers" });
              router.push("/loan-offers");
            }}
          >
            View Loan Offers
          </button>
          <Link
            href="/eligibility"
            onClick={() => trackEvent("navigation_clicked", { destination: "eligibility" })}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Check Eligibility
          </Link>
          <Link
            href="/application-status"
            onClick={() => trackEvent("navigation_clicked", { destination: "application_status" })}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Track Status
          </Link>
          <Link
            href="/apply-loan"
            onClick={() => {
              trackEvent("loan_application_started", { source: "dashboard" });
              trackEvent("navigation_clicked", { destination: "apply_loan" });
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply for Loan
          </Link>
          <SupportModal />
        </div>
      </Card>

      <EmiCalculator />

      <Card title="Recommended For You" subtitle="Simulate delayed recommendation loading after user idle behavior.">
        <button
          type="button"
          onClick={loadRecommendations}
          disabled={loadingRecommendations}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingRecommendations ? "Loading recommendations..." : "Load Recommended Loans"}
        </button>

        {recommendedOffers.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {recommendedOffers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                onClick={() => trackEvent("recommended_offer_clicked", { offer_id: offer.id, title: offer.title })}
              >
                <p className="font-medium text-slate-900">{offer.title}</p>
                <p className="text-sm text-slate-600">Up to {offer.amount}</p>
              </button>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
