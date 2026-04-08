import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AnalyticsFunnelChart from "@/components/AnalyticsFunnelChart";
import { useDashboard } from "@/context/DashboardContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const ANALYTICS_BASE = BASE_URL;
const WINDOW_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
];

function formatDurationMs(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe) || safe <= 0) return "0s";

  const seconds = Math.round(safe / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remSeconds = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remSeconds}s`;
  return `${remSeconds}s`;
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

export default function FunnelsPage() {
  const router = useRouter();
  const { addWidgetToDashboard } = useDashboard();
  const [projectId, setProjectId] = useState("");
  const [eventOptions, setEventOptions] = useState([]);
  const [funnelBuilder, setFunnelBuilder] = useState({
    id: "",
    name: "",
    mode: "strict",
    analysis_mode: "user",
    window_hours: 24,
    steps: [],
  });
  const [savedFunnels, setSavedFunnels] = useState([]);
  const [funnelResult, setFunnelResult] = useState(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState("");
  const [funnelMessage, setFunnelMessage] = useState("");
  const [funnelEventSearch, setFunnelEventSearch] = useState("");
  const [savedFunnelSearch, setSavedFunnelSearch] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [metricsTab, setMetricsTab] = useState("conversion");

  useEffect(() => {
    if (!router.isReady) return;

    let next = String(router.query.project_id || "").trim();
    if (!next && typeof window !== "undefined") {
      next = String(window.localStorage.getItem("analytics_active_project_id") || "").trim();
    }
    if (next) {
      setProjectId(next);
    }
  }, [router.isReady, router.query.project_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!projectId) {
      window.localStorage.removeItem("analytics_active_project_id");
      return;
    }
    window.localStorage.setItem("analytics_active_project_id", projectId);
  }, [projectId]);

  useEffect(() => {
    let rawPrefill = String(router.query.prefillSteps || "").trim();
    let prefillName = String(router.query.name || "").trim();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search || "");
      rawPrefill = rawPrefill || String(params.get("prefillSteps") || "").trim();
      prefillName = prefillName || String(params.get("name") || "").trim();
    }

    if (!rawPrefill) return;

    const prefillSteps = rawPrefill
      .split("|")
      .map((step) => String(step || "").trim())
      .filter(Boolean);

    if (prefillSteps.length < 2) return;

    setFunnelBuilder((prev) => ({
      ...prev,
      id: "",
      name: prefillName || prev.name,
      steps: prefillSteps,
    }));
    setFunnelMessage("Loaded path as a funnel draft from Journeys.");
  }, [router.isReady, router.query.name, router.query.prefillSteps]);

  const filteredFunnelEventOptions = useMemo(() => {
    if (!funnelEventSearch) return eventOptions;
    const needle = funnelEventSearch.toLowerCase();
    return eventOptions.filter((item) => item.toLowerCase().includes(needle));
  }, [eventOptions, funnelEventSearch]);

  useEffect(() => {
    async function loadEventOptionsAndFunnels() {
      try {
        const projectQuery = projectId ? `&project_id=${encodeURIComponent(projectId)}` : "";
        const [eventsResponse, funnelsResponse] = await Promise.all([
          fetch(`${ANALYTICS_BASE}/api/events?groupBy=event_name${projectQuery}`),
          fetch(`${ANALYTICS_BASE}/api/funnels`),
        ]);

        const eventRows = eventsResponse.ok ? await eventsResponse.json() : [];
        const options = Array.isArray(eventRows)
          ? eventRows
              .map((row) => row.label)
              .filter(Boolean)
              .filter((value, index, arr) => arr.indexOf(value) === index)
          : [];
        setEventOptions(options);

        const funnelRows = funnelsResponse.ok ? await funnelsResponse.json() : [];
        const list = Array.isArray(funnelRows) ? funnelRows : [];
        setSavedFunnels(list);
      } catch (err) {
        setFunnelError(err.message || "Unable to initialize funnels workspace.");
      }
    }

    loadEventOptionsAndFunnels();
  }, [projectId]);

  async function runFunnelAnalysis(config) {
    setFunnelLoading(true);
    setFunnelError("");

    try {
      const response = await fetch(`${ANALYTICS_BASE}/api/funnels/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: config.steps.map((event_name, index) => ({ order: index + 1, event_name })),
          mode: config.mode,
          analysis_mode: config.analysis_mode,
          window_hours: Number(config.window_hours || 24),
          project_id: projectId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(getErrorMessageFromPayload(payload, `Funnel analysis failed (${response.status})`));
      }

      const metrics = await response.json();
      setFunnelResult(metrics);
    } catch (err) {
      setFunnelResult(null);
      setFunnelError(err.message || "Unable to analyze funnel.");
    } finally {
      setFunnelLoading(false);
    }
  }

  async function saveFunnel() {
    const payload = {
      name: funnelBuilder.name.trim() || "Untitled Funnel",
      mode: funnelBuilder.mode,
      analysis_mode: funnelBuilder.analysis_mode,
      window_hours: Number(funnelBuilder.window_hours || 24),
      steps: funnelBuilder.steps.map((event_name, index) => ({ order: index + 1, event_name })),
    };

    const method = funnelBuilder.id ? "PUT" : "POST";
    const url = funnelBuilder.id
      ? `${ANALYTICS_BASE}/api/funnels/${encodeURIComponent(funnelBuilder.id)}`
      : `${ANALYTICS_BASE}/api/funnels`;

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(getErrorMessageFromPayload(body, `Save failed (${response.status})`));
      }

      const saved = await response.json();
      setSavedFunnels((prev) => {
        if (method === "POST") return [saved, ...prev];
        return prev.map((item) => (item.id === saved.id ? saved : item));
      });
      setFunnelBuilder((prev) => ({ ...prev, id: saved.id }));
      setFunnelMessage(method === "POST" ? "Funnel saved." : "Funnel updated.");
    } catch (err) {
      setFunnelError(err.message || "Unable to save funnel.");
    }
  }

  function editSavedFunnel(funnel) {
    setFunnelBuilder({
      id: funnel.id,
      name: funnel.name,
      mode: funnel.mode,
      analysis_mode: funnel.analysis_mode,
      window_hours: Number(funnel.window_hours || 24),
      steps: Array.isArray(funnel.steps) ? funnel.steps.map((item) => item.event_name) : [],
    });
  }

  async function deleteSavedFunnel(funnelId) {
    try {
      const response = await fetch(`${ANALYTICS_BASE}/api/funnels/${encodeURIComponent(funnelId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(getErrorMessageFromPayload(body, `Delete failed (${response.status})`));
      }

      setSavedFunnels((prev) => prev.filter((item) => item.id !== funnelId));
      if (funnelBuilder.id === funnelId) {
        setFunnelBuilder((prev) => ({ ...prev, id: "" }));
      }
      setFunnelMessage("Funnel deleted.");
    } catch (err) {
      setFunnelError(err.message || "Unable to delete funnel.");
    }
  }

  function createNewFunnel() {
    setFunnelBuilder({
      id: "",
      name: "",
      mode: "strict",
      analysis_mode: "user",
      window_hours: 24,
      steps: [],
    });
    setFunnelMessage("Started a new funnel draft.");
  }

  function addFunnelStep(eventName = "") {
    setFunnelBuilder((prev) => ({ ...prev, steps: [...prev.steps, String(eventName || "")] }));
  }

  function updateFunnelStep(index, nextValue) {
    setFunnelBuilder((prev) => ({
      ...prev,
      steps: prev.steps.map((item, idx) => (idx === index ? nextValue : item)),
    }));
  }

  function isKnownEventStep(stepValue) {
    const value = String(stepValue || "").trim();
    if (!value) return true;
    return eventOptions.includes(value);
  }

  function removeFunnelStep(index) {
    setFunnelBuilder((prev) => {
      const next = prev.steps.filter((_, idx) => idx !== index);
      return { ...prev, steps: next };
    });
  }

  function reorderFunnelSteps(fromIndex, toIndex) {
    setFunnelBuilder((prev) => {
      if (fromIndex === toIndex || fromIndex == null || toIndex == null) return prev;
      if (fromIndex < 0 || fromIndex >= prev.steps.length) return prev;
      if (toIndex < 0 || toIndex >= prev.steps.length) return prev;

      const next = [...prev.steps];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, steps: next };
    });
  }

  useEffect(() => {
    const normalizedSteps = funnelBuilder.steps.filter(Boolean);
    if (normalizedSteps.length < 2) {
      setFunnelResult(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void runFunnelAnalysis({
        ...funnelBuilder,
        steps: normalizedSteps,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [funnelBuilder]);

  const filteredSavedFunnels = useMemo(() => {
    if (!savedFunnelSearch.trim()) return savedFunnels;
    const needle = savedFunnelSearch.toLowerCase();
    return savedFunnels.filter((funnel) => String(funnel.name || "").toLowerCase().includes(needle));
  }, [savedFunnelSearch, savedFunnels]);

  const currentFunnelSummary = useMemo(() => {
    const stepCount = funnelBuilder.steps.length;
    const entered = Number(funnelResult?.total_users_entered || 0);
    const completed = Number(funnelResult?.total_users_completed || 0);
    const completionRate = Number(funnelResult?.completion_rate || 0);
    return { stepCount, entered, completed, completionRate };
  }, [funnelBuilder.steps.length, funnelResult]);

  function addFunnelWidget() {
    addWidgetToDashboard({
      type: "funnel-chart",
      title: funnelBuilder.name.trim() || "Funnel Conversion",
      chartType: "funnel",
      data: Array.isArray(funnelResult?.steps) ? funnelResult.steps : [],
      sourcePage: "/funnels",
      sourceLabel: "Funnels",
      description: `Window ${Number(funnelBuilder.window_hours || 24)} hours | ${funnelBuilder.mode} mode`,
    });
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Conversion Funnels</h1>
        <p className="mt-1 text-sm text-slate-500">Design and analyze multi-step journeys with clear drop-off visibility.</p>
      </section>

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 space-y-6">

      {funnelError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{funnelError}</p> : null}
      {funnelMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{funnelMessage}</p> : null}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Card className="p-6 text-slate-900 shadow-sm border border-slate-200">
            <p className="text-sm font-medium text-slate-500">Steps</p>
            <p className="mt-2 font-display text-3xl font-semibold text-slate-900">{currentFunnelSummary.stepCount}</p>
          </Card>
          <Card className="p-6 text-slate-900 shadow-sm border border-slate-200">
            <p className="text-sm font-medium text-slate-500">Entered</p>
            <p className="mt-2 font-display text-3xl font-semibold text-slate-900">{currentFunnelSummary.entered}</p>
          </Card>
          <Card className="p-6 text-slate-900 shadow-sm border border-slate-200">
            <p className="text-sm font-medium text-slate-500">Completed</p>
            <p className="mt-2 font-display text-3xl font-semibold text-slate-900">{currentFunnelSummary.completed}</p>
          </Card>
          <Card className="p-6 text-slate-900 shadow-sm border border-slate-200">
            <p className="text-sm font-medium text-slate-500">Completion Rate</p>
            <p className="mt-2 font-display text-3xl font-semibold text-slate-900">{currentFunnelSummary.completionRate}%</p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
          <Card className="flex flex-col border border-slate-200 shadow-sm p-5 h-[650px]">
            <div className="mb-4 flex items-center justify-between bg-white z-10">
              <h2 className="font-semibold text-slate-900">Builder</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={createNewFunnel}>New</Button>
                <Button variant="primary" size="sm" onClick={saveFunnel}>
                  {funnelBuilder.id ? "Update" : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1 pb-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Project ID Filter</label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. test-cervicare"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Funnel Name</label>
                <input
                  type="text"
                  value={funnelBuilder.name}
                  onChange={(e) => setFunnelBuilder((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Signup Journey"
                />
              </div>

              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Order</label>
                  <select value={funnelBuilder.mode} onChange={(e) => setFunnelBuilder((prev) => ({ ...prev, mode: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none">
                    <option value="strict">Strict Order</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Type</label>
                  <select value={funnelBuilder.analysis_mode} onChange={(e) => setFunnelBuilder((prev) => ({ ...prev, analysis_mode: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none">
                    <option value="user">User Funnel</option>
                    <option value="session">Session Funnel</option>
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-700">Window</label>
                  <select value={Number(funnelBuilder.window_hours)} onChange={(e) => setFunnelBuilder((prev) => ({ ...prev, window_hours: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none">
                    {WINDOW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

            <div className="pt-2">
              <label className="text-xs font-semibold text-slate-700 flex justify-between mb-2">
                <span>Steps Sequence</span>
                <span className="text-slate-400">{funnelBuilder.steps.length} steps</span>
              </label>
              
              <div className="space-y-2 relative">
                <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-slate-100 z-0" />

                {funnelBuilder.steps.length === 0 ? (
                  <div className="relative z-10 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                      <Icons.Plus className="w-3.5 h-3.5" />
                    </div>
                    <button
                      type="button"
                      onClick={() => addFunnelStep("")}
                      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:bg-white hover:border-slate-400 transition-colors"
                    >
                      Add Step
                    </button>
                  </div>
                ) : null}
                
                {funnelBuilder.steps.map((step, index) => (
                  <div
                    key={`funnel-step-${index}`}
                    draggable
                    onDragStart={() => { setDragIndex(index); setDragOverIndex(index); }}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== index) setDragOverIndex(index); }}
                    onDrop={(e) => { e.preventDefault(); reorderFunnelSteps(dragIndex, index); setDragIndex(null); setDragOverIndex(null); }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`relative z-10 flex items-center gap-2 group ${dragOverIndex === index ? "opacity-50" : ""}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 cursor-grab active:cursor-grabbing">
                      {index + 1}
                    </div>
                    <div className="flex-1 flex gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm group-hover:border-slate-300 transition-colors">
                      <select value={step} onChange={(e) => updateFunnelStep(index, e.target.value)} className="w-full bg-transparent px-2 py-1 text-sm outline-none text-slate-700 font-medium">
                        <option value="">Select event...</option>
                        {!isKnownEventStep(step) && step ? (
                          <option value={step}>{step} (from journey path)</option>
                        ) : null}
                        {eventOptions.map((eventName) => (
                          <option key={`${eventName}-${index}`} value={eventName}>{eventName}</option>
                        ))}
                      </select>
                      <Button variant="ghost" size="icon" onClick={() => removeFunnelStep(index)} className="w-7 h-7 text-slate-400 hover:text-red-500 hover:bg-red-50" title="Remove Step">
                        <Icons.Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <div className="relative z-10 flex items-center gap-2 mt-4 ml-8">
                   <select value="" onChange={(e) => { if (!e.target.value) return; addFunnelStep(e.target.value); e.target.value = ""; }} className="flex-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none hover:border-slate-400 hover:bg-white transition-colors cursor-pointer">
                      <option value="">+ Add Step...</option>
                      {filteredFunnelEventOptions.map((eventName) => (
                        <option key={`add-${eventName}`} value={eventName}>{eventName}</option>
                      ))}
                   </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-0 overflow-hidden flex flex-col h-[400px]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="font-semibold text-slate-900">Visualization</h2>
              <Button variant="ghost" size="sm" onClick={addFunnelWidget} title="Add to Dashboard">
                <Icons.Add className="w-4 h-4 mr-1.5" /> Dashboard
              </Button>
            </div>
            <div className="flex-1 p-5 bg-slate-50/50 flex flex-col relative overflow-y-auto overflow-x-hidden">
              {funnelLoading && (
                <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}
              {!funnelResult?.steps?.length && !funnelLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Icons.Filter className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">Not enough steps to visualize funnel</p>
                </div>
              ) : (
                <AnalyticsFunnelChart data={funnelResult?.steps || []} />
              )}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {[
                  { id: 'conversion', label: 'Conversion' },
                  { id: 'dropoff', label: 'Drop-off' },
                  { id: 'time', label: 'Time to Convert' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setMetricsTab(tab.id)}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${metricsTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-0">
              {metricsTab === "conversion" && (
                funnelResult?.steps?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-3 font-medium">Step</th>
                          <th className="px-6 py-3 font-medium text-right">Users</th>
                          <th className="px-6 py-3 font-medium text-right">Conversion Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {funnelResult.steps.map((step, idx) => (
                          <tr key={`${step.step_order}-${step.event_name}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-900 flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-slate-100 text-[10px] flex items-center justify-center text-slate-500 font-bold">{idx + 1}</span>
                              {step.event_name}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-slate-900">{step.users.toLocaleString()}</td>
                            <td className="px-6 py-3 text-right">
                              {step.conversion_rate_from_previous == null ? (
                                <Badge variant="default" className="bg-slate-100 text-slate-500">100%</Badge>
                              ) : (
                                <Badge variant="success" className="font-mono bg-emerald-50 text-emerald-700 border-emerald-100">{step.conversion_rate_from_previous}%</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">Run a funnel to see conversion metrics.</div>
                )
              )}

              {metricsTab === "dropoff" && (
                funnelResult?.steps?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-3 font-medium">Step</th>
                          <th className="px-6 py-3 font-medium text-right">Users</th>
                          <th className="px-6 py-3 font-medium text-right">Drop-off Users</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {funnelResult.steps.map((step, idx) => (
                          <tr key={`drop-${step.step_order}-${step.event_name}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-900 flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-slate-100 text-[10px] flex items-center justify-center text-slate-500 font-bold">{idx + 1}</span>
                              {step.event_name}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-slate-900">{step.users.toLocaleString()}</td>
                            <td className="px-6 py-3 text-right">
                              {step.dropoff_count > 0 ? (
                                <span className="text-red-600 font-mono font-medium">-{step.dropoff_count.toLocaleString()}</span>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">Run a funnel to see drop-off metrics.</div>
                )
              )}

              {metricsTab === "time" && (
                <div className="grid md:grid-cols-[1fr_2fr] divide-x divide-slate-100 p-0">
                  <div className="p-6 flex flex-col justify-center space-y-6 bg-slate-50/50">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Average Time</p>
                      <p className="font-display text-3xl font-semibold text-slate-900 drop-shadow-sm">
                        {formatDurationMs(funnelResult?.time_to_convert?.average_ms)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Median Time</p>
                      <p className="font-display text-2xl font-semibold text-slate-700">
                        {formatDurationMs(funnelResult?.time_to_convert?.median_ms)}
                      </p>
                    </div>
                  </div>
                  <div className="p-6">
                    <p className="mb-4 text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Icons.Filter className="w-4 h-4 text-slate-400" /> Time Distribution
                    </p>
                    <div className="space-y-3">
                      {(!funnelResult?.time_to_convert?.distribution?.length) ? (
                        <div className="text-sm text-slate-400 italic">No distribution data available.</div>
                      ) : (
                        (funnelResult?.time_to_convert?.distribution || []).map((bucket) => {
                          const maxCount = Math.max(...(funnelResult?.time_to_convert?.distribution || []).map(b => b.count), 1);
                          const percent = (bucket.count / maxCount) * 100;
                          return (
                            <div key={bucket.key} className="flex items-center gap-4 text-sm">
                              <span className="w-24 text-right text-slate-500 text-xs font-medium">{bucket.label}</span>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percent}%` }}></div>
                              </div>
                              <span className="w-12 font-semibold text-slate-900 font-mono text-right">{bucket.count}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
        </div>

        <Card className="p-6">
          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">Saved Funnels</h2>
              <p className="text-sm text-slate-500">Your library of custom funnels</p>
            </div>
            <div className="relative">
              <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={savedFunnelSearch}
                onChange={(e) => setSavedFunnelSearch(e.target.value)}
                placeholder="Search library..."
                className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
              />
            </div>
          </div>
          
          {filteredSavedFunnels.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-100 rounded-xl text-center flex flex-col items-center gap-3">
              <Icons.Search className="w-8 h-8 text-slate-300" />
              <div>
                <p className="text-slate-700 font-medium text-sm">No saved funnels yet</p>
                <p className="mt-1 text-xs text-slate-500">Build one in the funnel editor above and click Save.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={createNewFunnel}>
                Start a new funnel
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSavedFunnels.map((funnel) => (
                <div key={funnel.id} className="group border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all bg-white relative">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors pr-8">{funnel.name}</h3>
                    <Button variant="ghost" size="icon" onClick={() => deleteSavedFunnel(funnel.id)} className="w-7 h-7 text-slate-300 hover:text-red-600 hover:bg-red-50 absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Funnel">
                      <Icons.Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="default">{funnel.mode}</Badge>
                    <Badge variant="default">{funnel.analysis_mode}</Badge>
                    <Badge variant="default">{Number(funnel.window_hours)}h</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{(funnel.steps || []).length} Steps</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        editSavedFunnel(funnel);
                        setFunnelMessage(`Loaded "${funnel.name}"`);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs py-1 h-7"
                    >
                      Open in Builder
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
