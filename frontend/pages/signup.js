import { useState } from "react";
import { useRouter } from "next/router";
import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });

  usePageTracking("signup");

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    trackEvent("signup_started", { location: "signup_form_submit" });

    const created = signup(formData);
    if (!created) return;

    trackEvent("signup_completed", { email: formData.email });
    router.push("/login");
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card title="Create Your Account" subtitle="Start your loan journey with a secure profile.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-700">
            Full Name
            <input
              type="text"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Email
            <input
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Password
            <input
              type="password"
              required
              minLength={6}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
            />
          </label>
          <button
            type="submit"
            onClick={() => trackEvent("signup_button_clicked")}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create Account
          </button>
        </form>
      </Card>
    </div>
  );
}
