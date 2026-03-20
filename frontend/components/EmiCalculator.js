import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { trackEvent } from "@/utils/analytics";

export default function EmiCalculator() {
  const [amount, setAmount] = useState(500000);
  const [rate, setRate] = useState(10);
  const [months, setMonths] = useState(24);
  const [emi, setEmi] = useState(null);

  useEffect(() => {
    trackEvent("emi_calculator_opened");
  }, []);

  const calculateEmi = () => {
    const monthlyRate = rate / 12 / 100;
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    const result =
      denominator === 0
        ? amount / months
        : (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / denominator;

    const rounded = Math.round(result);
    setEmi(rounded);

    trackEvent("emi_calculated", {
      amount,
      annualRate: rate,
      tenureMonths: months,
      emi: rounded,
    });
  };

  return (
    <Card title="Calculate EMI" subtitle="Estimate your monthly payment before applying.">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          Amount
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={10000}
          />
        </label>
        <label className="text-sm text-slate-700">
          Rate (%)
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            min={1}
            step={0.1}
          />
        </label>
        <label className="text-sm text-slate-700">
          Tenure (Months)
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            min={3}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={calculateEmi}
        >
          Calculate EMI
        </button>
        {emi ? <p className="text-sm text-slate-700">Estimated EMI: INR {emi.toLocaleString()}</p> : null}
      </div>
    </Card>
  );
}
