import { useState } from "react";
import { useRouter } from "next/router";
import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  usePageTracking("login");

  const handleSubmit = (e) => {
    e.preventDefault();
    trackEvent("login_attempted", { email: formData.email });

    const success = login(formData);
    if (!success) {
      setError("Invalid credentials. Please use the account created in signup.");
      trackEvent("login_failed", { email: formData.email });
      return;
    }

    trackEvent("login_success", { email: formData.email });
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card title="Welcome Back" subtitle="Log in to continue your loan application.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-700">
            Email
            <input
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Password
            <input
              type="password"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            onClick={() => trackEvent("login_button_clicked")}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Log In
          </button>
        </form>
      </Card>
    </div>
  );
}
