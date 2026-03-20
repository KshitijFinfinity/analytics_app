import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

const employmentOptions = ["Salaried", "Self-Employed", "Freelancer", "Student"];

export default function EligibilityPage() {
  const [formData, setFormData] = useState({
    monthlyIncome: "",
    creditScore: "",
    employmentType: "Salaried",
    existingLoans: "0",
  });
  const [result, setResult] = useState(null);

  usePageTracking("eligibility_checker");

  useEffect(() => {
    trackEvent("eligibility_checker_opened");
  }, []);

  const onChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const checkEligibility = (e) => {
    e.preventDefault();

    const monthlyIncome = Number(formData.monthlyIncome || 0);
    const creditScore = Number(formData.creditScore || 0);
    const existingLoans = Number(formData.existingLoans || 0);

    trackEvent("eligibility_form_submitted", {
      monthlyIncome,
      creditScore,
      employmentType: formData.employmentType,
      existingLoans,
    });

    const score =
      (monthlyIncome >= 50000 ? 1 : 0) +
      (creditScore >= 700 ? 1 : 0) +
      (formData.employmentType !== "Student" ? 1 : 0) +
      (existingLoans <= 2 ? 1 : 0);

    const eligible = score >= 3;
    const approvedLimit = eligible ? Math.max(150000, Math.round(monthlyIncome * 8)) : 0;
    const status = eligible ? "Eligible" : "Not Eligible";

    setResult({ status, approvedLimit });
    trackEvent("eligibility_result_viewed", { status, approvedLimit });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title="Loan Eligibility Checker" subtitle="Get a quick simulated result in seconds.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={checkEligibility}>
          <label className="text-sm text-slate-700">
            Monthly Income (INR)
            <input
              type="number"
              required
              min={0}
              value={formData.monthlyIncome}
              onChange={(e) => onChange("monthlyIncome", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Credit Score
            <input
              type="number"
              required
              min={300}
              max={900}
              value={formData.creditScore}
              onChange={(e) => onChange("creditScore", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Employment Type
            <select
              value={formData.employmentType}
              onChange={(e) => onChange("employmentType", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {employmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Existing Loans
            <input
              type="number"
              min={0}
              value={formData.existingLoans}
              onChange={(e) => onChange("existingLoans", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="sm:col-span-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Check Eligibility
          </button>
        </form>
      </Card>

      {result ? (
        <Card title="Eligibility Result" subtitle="Simulated output for analytics testing.">
          <p className="text-sm text-slate-700">
            Status: <span className="font-semibold">{result.status}</span>
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Suggested Max Loan: <span className="font-semibold">INR {result.approvedLimit.toLocaleString()}</span>
          </p>
          <div className="mt-4">
            <Link
              href="/loan-offers"
              onClick={() => trackEvent("navigation_clicked", { destination: "loan_offers" })}
              className="inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              View Matching Offers
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
