import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Card from "@/components/Card";
import ProgressBar from "@/components/ProgressBar";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

const steps = ["Personal Details", "Employment Details", "Loan Details", "Upload Documents", "Review & Submit"];

const initialData = {
  personal: { name: "", phone: "", dob: "" },
  employment: { company: "", salary: "" },
  loan: { amount: "", tenure: "" },
  documents: { pan: "", aadhaar: "", salarySlip: "" },
};

export default function ApplyLoanPage() {
  const router = useRouter();
  const { isAuthenticated, loading, saveLoanApplication } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(initialData);

  usePageTracking("apply_loan");

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    trackEvent("loan_application_started", { step: 1 });
  }, []);

  useEffect(() => {
    if (step === 4) {
      trackEvent("document_upload_started");
    }
  }, [step]);

  const canContinue = useMemo(() => {
    if (step === 1) return formData.personal.name && formData.personal.phone && formData.personal.dob;
    if (step === 2) return formData.employment.company && formData.employment.salary;
    if (step === 3) return formData.loan.amount && formData.loan.tenure;
    if (step === 4) return formData.documents.pan && formData.documents.aadhaar && formData.documents.salarySlip;
    return true;
  }, [formData, step]);

  const setGroupField = (group, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  };

  const nextStep = () => {
    if (!canContinue) return;
    if (step === 4) {
      trackEvent("document_upload_completed");
    }
    trackEvent("loan_step_completed", { completedStep: step, stepName: steps[step - 1] });
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const previousStep = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const submitApplication = (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      submittedAt: new Date().toISOString(),
      applicationId: `APP-${Math.floor(100000 + Math.random() * 900000)}`,
      status: "Submitted",
    };

    saveLoanApplication(payload);
    trackEvent("loan_step_completed", { completedStep: 5, stepName: "Review & Submit" });
    trackEvent("loan_application_submitted", {
      applicationId: payload.applicationId,
      amount: payload.loan.amount,
      tenure: payload.loan.tenure,
    });
    router.push("/loan-confirmation");
  };

  if (loading || !isAuthenticated) {
    return <p className="text-sm text-slate-600">Loading application flow...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ProgressBar step={step} totalSteps={5} />

      <Card title="Loan Application" subtitle={steps[step - 1]}>
        <form className="space-y-5" onSubmit={submitApplication}>
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-700 sm:col-span-2">
                Full Name
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.personal.name}
                  onChange={(e) => setGroupField("personal", "name", e.target.value)}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Phone Number
                <input
                  type="tel"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.personal.phone}
                  onChange={(e) => setGroupField("personal", "phone", e.target.value)}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Date of Birth
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.personal.dob}
                  onChange={(e) => setGroupField("personal", "dob", e.target.value)}
                  required
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Company Name
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.employment.company}
                  onChange={(e) => setGroupField("employment", "company", e.target.value)}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Monthly Salary (INR)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.employment.salary}
                  onChange={(e) => setGroupField("employment", "salary", e.target.value)}
                  required
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Loan Amount (INR)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.loan.amount}
                  onChange={(e) => setGroupField("loan", "amount", e.target.value)}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Tenure (Months)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={formData.loan.tenure}
                  onChange={(e) => setGroupField("loan", "tenure", e.target.value)}
                  required
                />
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm text-slate-700">
                Upload PAN
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(e) => {
                    const fileName = e.target.files?.[0]?.name || "";
                    setGroupField("documents", "pan", fileName);
                    if (fileName) {
                      trackEvent("document_uploaded", { document_type: "pan", file_name: fileName });
                    }
                  }}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Upload Aadhaar
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(e) => {
                    const fileName = e.target.files?.[0]?.name || "";
                    setGroupField("documents", "aadhaar", fileName);
                    if (fileName) {
                      trackEvent("document_uploaded", { document_type: "aadhaar", file_name: fileName });
                    }
                  }}
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                Upload Salary Slip
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(e) => {
                    const fileName = e.target.files?.[0]?.name || "";
                    setGroupField("documents", "salarySlip", fileName);
                    if (fileName) {
                      trackEvent("document_uploaded", { document_type: "salary_slip", file_name: fileName });
                    }
                  }}
                  required
                />
              </label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Name:</span> {formData.personal.name}
              </p>
              <p>
                <span className="font-semibold">Phone:</span> {formData.personal.phone}
              </p>
              <p>
                <span className="font-semibold">DOB:</span> {formData.personal.dob}
              </p>
              <p>
                <span className="font-semibold">Company:</span> {formData.employment.company}
              </p>
              <p>
                <span className="font-semibold">Salary:</span> INR {Number(formData.employment.salary || 0).toLocaleString()}
              </p>
              <p>
                <span className="font-semibold">Loan Amount:</span> INR {Number(formData.loan.amount || 0).toLocaleString()}
              </p>
              <p>
                <span className="font-semibold">Tenure:</span> {formData.loan.tenure} months
              </p>
              <p>
                <span className="font-semibold">PAN File:</span> {formData.documents.pan}
              </p>
              <p>
                <span className="font-semibold">Aadhaar File:</span> {formData.documents.aadhaar}
              </p>
              <p>
                <span className="font-semibold">Salary Slip:</span> {formData.documents.salarySlip}
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={previousStep}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={step === 1}
            >
              Back
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canContinue}
              >
                Next Step
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Submit Application
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
