import { useEffect, useMemo, useState } from "react";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const CONFIGURED_BACKEND_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE;
const LOCAL_BACKEND_BASE = "http://localhost:4001";
let resolvedBackendBase = null;

function getBackendBases() {
  const isLocalHost = typeof window !== "undefined"
    && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const preferred = isLocalHost
    ? [LOCAL_BACKEND_BASE, CONFIGURED_BACKEND_BASE, BASE_URL]
    : [CONFIGURED_BACKEND_BASE, BASE_URL, LOCAL_BACKEND_BASE];

  return preferred.filter((base, index, values) => Boolean(base) && values.indexOf(base) === index);
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getErrorMessageFromPayload(payload, fallback) {
  if (payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

async function requestBackend(path, options = {}) {
  const timeout = Number(options.timeout || 10000);
  const backendBases = getBackendBases();
  const candidateBases = [resolvedBackendBase, ...backendBases].filter(
    (base, index, values) => Boolean(base) && values.indexOf(base) === index
  );
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const candidatePaths = [
    `/api${normalizedPath}`,
    normalizedPath,
    `/analytics${normalizedPath}`,
  ];

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const base of candidateBases) {
      for (const pathVariant of candidatePaths) {
        let timeoutId;

        try {
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(`${base}${pathVariant}`, {
            ...options,
            signal: controller.signal,
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(
              getErrorMessageFromPayload(payload, `Server ${base} returned ${response.status}`)
            );
          }

          resolvedBackendBase = base;
          return await response.json();
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }

    if (attempt < 1) {
      await sleep(350);
    }
  }

  throw lastError || new Error("Could not reach backend");
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white shadow"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildHostedSnippet({ projectId, scriptHost, backendBase }) {
  const safeProjectId = String(projectId || "my_project").trim() || "my_project";
  const safeScriptHost = trimTrailingSlash(scriptHost || "https://your-cdn-domain.com/tracker");
  const safeBackendBase = trimTrailingSlash(backendBase || "https://your-backend-domain.com");
  return [
    "<script",
    `  src=\"${safeScriptHost}/sdk.js\"`,
    `  data-project-id=\"${safeProjectId}\"`,
    `  data-endpoint=\"${safeBackendBase}/api/track\"`,
    "></script>",
  ].join("\n");
}

function buildInlineSnippet({ projectId, backendBase }) {
  const safeProjectId = String(projectId || "my_project").trim() || "my_project";
  const safeBackendBase = trimTrailingSlash(backendBase || "https://your-backend-domain.com");
  return [
    "<script>",
    "(function () {",
    `  var PROJECT_ID = \"${safeProjectId}\";`,
    `  var API_BASE = \"${safeBackendBase}/api\";`,
    "",
    "  function getOrCreate(key, storage, prefix) {",
    "    try {",
    "      var existing = storage.getItem(key);",
    "      if (existing) return existing;",
    "      var next = prefix + \"_\" + Date.now() + \"_\" + Math.random().toString(36).slice(2, 10);",
    "      storage.setItem(key, next);",
    "      return next;",
    "    } catch (_err) {",
    "      return prefix + \"_\" + Date.now() + \"_\" + Math.random().toString(36).slice(2, 10);",
    "    }",
    "  }",
    "",
    "  function send(eventName, properties) {",
    "    var payload = {",
    "      project_id: PROJECT_ID,",
    "      user_id: getOrCreate(\"analytics_user_id\", window.localStorage, \"u\"),",
    "      session_id: getOrCreate(\"analytics_session_id\", window.sessionStorage, \"s\"),",
    "      event_name: eventName,",
    "      page: window.location.pathname,",
    "      properties: properties || {},",
    "      timestamp: new Date().toISOString(),",
    "    };",
    "",
    "    try {",
    "      fetch(API_BASE + \"/track\", {",
    "        method: \"POST\",",
    "        headers: { \"Content-Type\": \"application/json\" },",
    "        body: JSON.stringify(payload),",
    "        keepalive: true,",
    "      });",
    "    } catch (_err) {}",
    "  }",
    "",
    "  send(\"page_view\", { href: window.location.href, title: document.title });",
    "",
    "  window.analytics = window.analytics || {};",
    "  window.analytics.track = send;",
    "})();",
    "</script>",
  ].join("\n");
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [projectId, setProjectId] = useState("*");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [severity, setSeverity] = useState("fatal");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [toast, setToast] = useState("");
  const [scriptHost, setScriptHost] = useState("https://your-cdn-domain.com/tracker");
  const [backendHost, setBackendHost] = useState(CONFIGURED_BACKEND_BASE || LOCAL_BACKEND_BASE);

  const hostedSnippet = useMemo(
    () => buildHostedSnippet({ projectId, scriptHost, backendBase: backendHost }),
    [projectId, scriptHost, backendHost]
  );

  const inlineSnippet = useMemo(
    () => buildInlineSnippet({ projectId, backendBase: backendHost }),
    [projectId, backendHost]
  );

  const prettySource = useMemo(() => {
    if (sourceLabel === "db") return "Project-specific settings";
    if (sourceLabel === "db-global") return "Global settings (*)";
    if (sourceLabel === "env") return "Backend .env fallback";
    return "";
  }, [sourceLabel]);

  async function loadAlertSettings() {
    try {
      setLoading(true);
      setError("");
      setStatus("");

      const payload = await requestBackend(
        `/alerts/settings?project_id=${encodeURIComponent(projectId || "*")}`
      );

      setEmails(Array.isArray(payload.emails) ? payload.emails : []);
      setAlertsEnabled(payload.alerts_enabled !== false);
      setSeverity(payload.severity || "fatal");
      setSourceLabel(payload.source || "");
      setHasLoadedOnce(true);
      setStatus("Current alert settings loaded.");
    } catch (err) {
      setError(
        err.message ||
          "Could not fetch alert settings. Ensure backend is running and restart backend after code changes."
      );
    } finally {
      setLoading(false);
    }
  }

  function addEmail(rawEmail) {
    const candidate = String(rawEmail || "").trim();
    if (!candidate) return;

    if (!isValidEmail(candidate)) {
      setError("Enter a valid email address.");
      return;
    }

    const exists = emails.some((email) => email.toLowerCase() === candidate.toLowerCase());
    if (exists) {
      setError("This email is already added.");
      return;
    }

    const nextEmails = [...emails, candidate];
    setEmails(nextEmails);
    setEmailInput("");
    setError("");
    void saveAlertSettings(nextEmails);
  }

  function removeEmail(emailToRemove) {
    const nextEmails = emails.filter((email) => email !== emailToRemove);
    setEmails(nextEmails);
    void saveAlertSettings(nextEmails);
  }

  async function saveAlertSettings(nextEmails = emails) {
    const normalizedEmails = Array.isArray(nextEmails) ? nextEmails : emails;
    try {
      setSaving(true);
      setError("");
      setStatus("");

      if (alertsEnabled && normalizedEmails.length === 0) {
        setError("Add at least one email when alerts are enabled.");
        setSaving(false);
        return;
      }

      const payload = await requestBackend("/alerts/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId || "*",
          emails: normalizedEmails,
          alerts_enabled: alertsEnabled,
          severity,
        }),
      });

      setEmails(Array.isArray(payload.emails) ? payload.emails : normalizedEmails);
      setAlertsEnabled(payload.alerts_enabled !== false);
      setSeverity(payload.severity || severity);
      setSourceLabel("db");
      setStatus("Alert settings saved successfully.");
      setToast("Settings saved");
    } catch (err) {
      setError(
        err.message ||
          "Could not save alert settings. Ensure backend is running and restart backend after code changes."
      );
    } finally {
      setSaving(false);
    }
  }

  async function testAlertConfiguration() {
    try {
      setTesting(true);
      setError("");
      setStatus("");
      const payload = await requestBackend(
        `/errors/test-alert?project_id=${encodeURIComponent(projectId || "*")}`
      );
      if (payload.success) {
        setStatus(payload.message || "Test alert email sent successfully.");
        setToast("Test successful");
      } else {
        setError(payload.message || "Test alert email failed.");
      }
    } catch (err) {
      setError(err.message || "Could not send test alert email.");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "alerts" || hasLoadedOnce) return;
    loadAlertSettings();
  }, [activeTab, hasLoadedOnce]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setToast(`${label} copied`);
    } catch (_err) {
      setError("Clipboard access failed. Copy manually from the text area.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Configure dashboard behavior and operations.</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>General</TabButton>
          <TabButton active={activeTab === "alerts"} onClick={() => setActiveTab("alerts")}>Alerts</TabButton>
        </div>
      </section>

      {activeTab === "general" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-display text-lg font-semibold">General</h2>
            <p className="mt-2 text-sm text-slate-600">Environment: Local development</p>
            <p className="text-sm text-slate-600">Analytics API target: {CONFIGURED_BACKEND_BASE || LOCAL_BACKEND_BASE}</p>
            <p className="text-sm text-slate-600">Website app: https://your-production-website-url.com</p>
            <p className="text-sm text-slate-600">Dashboard app: https://your-production-dashboard-url.com</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-display text-lg font-semibold">Data Retention</h2>
            <p className="mt-2 text-sm text-slate-600">Configure cleanup policies in backend services as needed.</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="font-display text-lg font-semibold">Tracking Script Generator</h2>
            <p className="mt-2 text-sm text-slate-600">
              Generate copy-ready snippets using your project id so events can be filtered per project in the Events page.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Project ID</span>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block md:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Script Host</span>
                <input
                  type="text"
                  value={scriptHost}
                  onChange={(e) => setScriptHost(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="https://cdn.company.com/tracker"
                />
              </label>

              <label className="block md:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Backend Base</span>
                <input
                  type="text"
                  value={backendHost}
                  onChange={(e) => setBackendHost(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="https://analytics.yourdomain.com"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Hosted Script Snippet</p>
                  <button
                    type="button"
                    onClick={() => copyText(hostedSnippet, "Hosted snippet")}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  value={hostedSnippet}
                  className="h-44 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Inline Script Snippet</p>
                  <button
                    type="button"
                    onClick={() => copyText(inlineSnippet, "Inline snippet")}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  value={inlineSnippet}
                  className="h-44 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700"
                />
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "alerts" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Alert Settings</h2>
            {prettySource ? <span className="text-xs text-slate-500">Loaded from: {prettySource}</span> : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">Configure who gets notified when critical errors happen.</p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block md:col-span-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Project</span>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="*"
              />
            </label>

            <label className="block md:col-span-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="fatal">Fatal only</option>
                <option value="high">High + Fatal</option>
                <option value="all">All</option>
              </select>
            </label>

            <label className="flex items-end gap-2 md:col-span-1">
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => setAlertsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">Enable Alerts</span>
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">🔔 Recipients</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {emails.length === 0 ? <span className="text-sm text-slate-500">No emails added yet.</span> : null}
              {emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="rounded-full px-1 text-slate-500 hover:bg-slate-200"
                    aria-label={`Remove ${email}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail(emailInput);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-80"
                placeholder="name@company.com"
              />
              <button
                type="button"
                onClick={() => addEmail(emailInput)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add Email
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadAlertSettings}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
            <button
              type="button"
              onClick={() => saveAlertSettings()}
              disabled={saving || loading}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={testAlertConfiguration}
              disabled={testing || loading}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {testing ? "Testing..." : "Test Alert"}
            </button>
          </div>

          {status ? <p className="mt-3 text-sm text-emerald-700">{status}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>
      ) : null}

      {toast ? (
        <div className="fixed right-5 top-20 z-50 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
