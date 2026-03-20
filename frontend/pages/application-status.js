import { useEffect } from "react";
import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

function buildTimeline(loanData) {
  if (!loanData) {
    return [
      { label: "Submitted", active: false },
      { label: "Under Review", active: false },
      { label: "Approved", active: false },
    ];
  }

  const submittedAt = Date.parse(loanData.submittedAt || "") || Date.now();
  const elapsedMinutes = Math.floor((Date.now() - submittedAt) / 60000);

  const underReview = elapsedMinutes >= 1;
  const finalDecision = elapsedMinutes >= 2;
  const approved = finalDecision ? loanData.applicationId?.charCodeAt(4) % 2 === 0 : false;

  if (!finalDecision) {
    return [
      { label: "Submitted", active: true },
      { label: "Under Review", active: underReview },
      { label: "Approved / Rejected", active: false },
    ];
  }

  return [
    { label: "Submitted", active: true },
    { label: "Under Review", active: true },
    { label: approved ? "Approved" : "Rejected", active: true },
  ];
}

export default function ApplicationStatusPage() {
  const { getLoanApplication } = useAuth();
  const loanData = getLoanApplication();
  const applicationId = loanData?.applicationId || null;
  const hasApplication = !!loanData;
  const timeline = buildTimeline(loanData);

  usePageTracking("application_status");

  useEffect(() => {
    trackEvent("application_status_viewed", {
      applicationId,
      hasApplication,
    });
  }, [applicationId, hasApplication]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title="Application Status" subtitle="Track your status progression.">
        {loanData ? (
          <p className="text-sm text-slate-700">
            Application ID: <span className="font-semibold">{loanData.applicationId}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">No application found yet. Submit a loan request first.</p>
        )}

        <ol className="mt-4 space-y-3">
          {timeline.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${step.active ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              <span className={`text-sm ${step.active ? "text-slate-900" : "text-slate-500"}`}>{step.label}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
