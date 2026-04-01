import { useState } from "react";
import Card from "@/components/Card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

const CONFIGURED_BACKEND_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE;
const FALLBACK_BACKEND_BASES = [4001, 4002, 4003, 4004, 4005, 4006].map(
  (port) => `https://your-production-domain.com:${port}`
);
const BACKEND_BASES = [CONFIGURED_BACKEND_BASE, ...FALLBACK_BACKEND_BASES].filter(
  (base, index, values) => Boolean(base) && values.indexOf(base) === index
);
const PROJECT_ID = process.env.NEXT_PUBLIC_ANALYTICS_PROJECT_ID || "8b2b11d0-ad4f-4d90-b046-aacb789f2ba3";

let resolvedBackendBase = null;

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getUserId() {
  const key = "user_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = createId("usr");
  window.localStorage.setItem(key, next);
  return next;
}

function getSessionId() {
  const key = "session_id";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = createId("ses");
  window.sessionStorage.setItem(key, next);
  return next;
}

async function postFatalError(payload) {
  const candidateBases = [resolvedBackendBase, ...BACKEND_BASES].filter(
    (base, index, values) => Boolean(base) && values.indexOf(base) === index
  );

  let lastError = null;

  for (const base of candidateBases) {
    try {
      const response = await fetch(`${base}/errors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server ${base} returned ${response.status}`);
      }

      resolvedBackendBase = base;
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No backend endpoint reachable");
}

export default function PaymentPage() {
  usePageTracking("payment");

  const [sending, setSending] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleTriggerFatalError() {
    if (typeof window === "undefined") return;

    setSending(true);
    setErrorMessage("");
    setResultMessage("");

    const payload = {
      project_id: PROJECT_ID,
      event_name: "error",
      user_id: getUserId(),
      session_id: getSessionId(),
      page: "/payment",
      url: `${window.location.origin}/payment`,
      timestamp: Date.now(),
      properties: {
        message: "Simulated fatal payment flow error (manual trigger)",
        source: "frontend/pages/payment.js",
        line: 99,
      },
    };

    try {
      const response = await postFatalError(payload);

      trackEvent("payment_fatal_error_button_clicked", {
        triggeredFatalRuleCount: response.rulesTriggered || 0,
        isFatal: Boolean(response.isFatal),
      });

      if (response.isFatal) {
        setResultMessage(
          "Fatal error event sent. If alert email credentials/recipients are configured, an alert email should be sent."
        );
      } else {
        setResultMessage("Error event sent, but fatal rules did not trigger.");
      }
    } catch (error) {
      setErrorMessage(error.message || "Failed to send fatal error event.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card title="Payment" subtitle="Demo payment page for testing analytics and alerting.">
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Use the button below to send a simulated <span className="font-semibold">fatal payment error</span> to the backend.
          </p>
          <p>
            This posts directly to <span className="font-semibold">/errors</span> with page <span className="font-semibold">/payment</span>,
            which matches the critical-page fatal rule.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTriggerFatalError}
            disabled={sending}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {sending ? "Sending..." : "Trigger Fatal Error Alert"}
          </button>
        </div>

        {resultMessage ? <p className="mt-4 text-sm text-emerald-700">{resultMessage}</p> : null}
        {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
      </Card>
    </div>
  );
}