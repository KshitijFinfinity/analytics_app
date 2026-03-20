import Link from "next/link";
import { useEffect } from "react";
import Card from "@/components/Card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

const offers = [
  { bankName: "NorthStar Bank", interestRate: "9.4%", maxLoan: "INR 12,00,000" },
  { bankName: "Riverline Finance", interestRate: "10.1%", maxLoan: "INR 8,00,000" },
  { bankName: "SkyTrust Credit", interestRate: "11.2%", maxLoan: "INR 5,50,000" },
];

export default function LoanOffersPage() {
  usePageTracking("loan_offers");

  useEffect(() => {
    trackEvent("loan_offers_viewed");
  }, []);

  const onCompare = () => {
    trackEvent("loan_offer_compared", { comparedCount: offers.length });
  };

  return (
    <div className="space-y-5">
      <Card title="Loan Offers" subtitle="Compare banks and continue your funnel journey.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">3 curated offers loaded for this borrower profile.</p>
          <button
            type="button"
            onClick={onCompare}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Compare Offers
          </button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {offers.map((offer) => (
          <Card key={offer.bankName} title={offer.bankName} subtitle={`Interest Rate: ${offer.interestRate}`}>
            <p className="text-sm text-slate-600">Max Loan: {offer.maxLoan}</p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/apply-loan"
                onClick={() => {
                  trackEvent("loan_offer_clicked", { bank_name: offer.bankName });
                  trackEvent("navigation_clicked", { destination: "apply_loan" });
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Apply
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
