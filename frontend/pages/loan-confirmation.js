import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

export default function LoanConfirmationPage() {
  const router = useRouter();
  const { isAuthenticated, loading, getLoanApplication } = useAuth();
  const loanData = !loading && isAuthenticated ? getLoanApplication() : null;

  usePageTracking("loan_confirmation");

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!loanData) {
      router.replace("/apply-loan");
      return;
    }

    trackEvent("confirmation_viewed", { applicationId: loanData.applicationId });
  }, [isAuthenticated, loading, loanData, router]);

  if (loading || !isAuthenticated || !loanData) {
    return <p className="text-sm text-slate-600">Loading confirmation...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card title="Application Submitted" subtitle="Your request is now in review.">
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          Application ID: <span className="font-semibold">{loanData.applicationId}</span>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <p>
            Loan Amount: <span className="font-semibold">INR {Number(loanData.loan.amount).toLocaleString()}</span>
          </p>
          <p>
            Tenure: <span className="font-semibold">{loanData.loan.tenure} months</span>
          </p>
          <p>
            Status: <span className="font-semibold">{loanData.status}</span>
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            onClick={() => trackEvent("confirmation_cta_clicked", { cta: "back_to_dashboard" })}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/apply-loan"
            onClick={() => trackEvent("confirmation_cta_clicked", { cta: "start_new_application" })}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Start New Application
          </Link>
        </div>
      </Card>
    </div>
  );
}
