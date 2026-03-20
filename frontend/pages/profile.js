import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/usePageTracking";
import { trackEvent } from "@/utils/analytics";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const hasUser = !!user;
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  usePageTracking("profile");

  useEffect(() => {
    trackEvent("profile_viewed", { hasUser });
  }, [hasUser]);

  const onChange = (key, value) => {
    setSaved(false);
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const nextUser = updateProfile(formData);
    if (!nextUser) return;

    trackEvent("profile_updated", {
      updatedFields: Object.keys(formData),
      email: nextUser.email,
    });
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card title="Your Profile" subtitle="Update details used across your loan journey.">
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-700">
            Name
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange("name", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Email
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onChange("email", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Phone
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>

          {saved ? <p className="text-sm text-emerald-700">Profile saved.</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Update Profile
          </button>
        </form>
      </Card>
    </div>
  );
}
