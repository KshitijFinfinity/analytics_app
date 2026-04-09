import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { fetchAnalytics, toQuery } from "@/utils/backendClient";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";
import { resolveActiveProjectId, setActiveProjectId } from "@/utils/projectScope";

const TABS = [
  { id: "flow", label: "Flow Map" },
  { id: "top", label: "Top Paths" },
  { id: "dropoffs", label: "Drop-offs" },
];

function formatDurationMs(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe) || safe <= 0) return "0s";

  const totalSeconds = Math.round(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

function percent(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}


export default function UserJourneysPage() {
  const router = useRouter();

  const [projectId, setProjectId] = useState(resolveActiveProjectId());

  const defaultDateRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, []);

  const [tab, setTab] = useState("flow");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [queryState, setQueryState] = useState({
    path: "/login",
    matchMode: "contains",
    metric: "events",
    userType: "all",
    device: "all",
    country: "all",
    startDate: defaultDateRange.startDate,
    endDate: defaultDateRange.endDate,
    depth: 5,
    branchLimit: 5,
    startNode: "",
  });

  const [journeyData, setJourneyData] = useState({
    nodes: [],
    links: [],
    graph: { start: "", levels: [], sankey: { nodes: [], links: [] } },
    transitions: [],
    dropoffs: [],
    top_paths: [],
    summary: { matched_sessions: 0, matched_users: 0, total_transitions: 0 },
    filters: { devices: [], countries: [] },
    effective_path: "",
  });

  const [selectedLinkKey, setSelectedLinkKey] = useState("");

  const metricLabel = queryState.metric === "users" ? "Unique users" : "Total events";

  useEffect(() => {
    if (!router.isReady) return;
    const next = resolveActiveProjectId(router.query.project_id);
    setProjectId(next);
    setActiveProjectId(next);
  }, [router.isReady, router.query.project_id]);

  useEffect(() => {
    async function loadJourneyFlow() {
      try {
        setLoading(true);
        setError("");

        const query = toQuery({
          path: queryState.path,
          matchMode: queryState.matchMode,
          metric: queryState.metric,
          userType: queryState.userType,
          device: queryState.device,
          country: queryState.country,
          project_id: projectId,
          startDate: queryState.startDate,
          endDate: queryState.endDate,
          depth: queryState.depth,
          branchLimit: queryState.branchLimit,
          startNode: queryState.startNode,
        });

        const payload = await fetchAnalytics(`/user-journeys/flow?${query}`, { timeout: 20000 });
        setJourneyData({
          nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
          links: Array.isArray(payload?.links) ? payload.links : [],
          graph: {
            start: String(payload?.graph?.start || ""),
            levels: Array.isArray(payload?.graph?.levels) ? payload.graph.levels : [],
            sankey: {
              nodes: Array.isArray(payload?.graph?.sankey?.nodes) ? payload.graph.sankey.nodes : [],
              links: Array.isArray(payload?.graph?.sankey?.links) ? payload.graph.sankey.links : [],
            },
          },
          transitions: Array.isArray(payload?.transitions) ? payload.transitions : [],
          dropoffs: Array.isArray(payload?.dropoffs) ? payload.dropoffs : [],
          top_paths: Array.isArray(payload?.top_paths) ? payload.top_paths : [],
          summary: payload?.summary || { matched_sessions: 0, matched_users: 0, total_transitions: 0 },
          filters: {
            devices: Array.isArray(payload?.filters?.devices) ? payload.filters.devices : [],
            countries: Array.isArray(payload?.filters?.countries) ? payload.filters.countries : [],
          },
          effective_path: String(payload?.effective_path || ""),
        });

        const firstLink = Array.isArray(payload?.links) && payload.links.length > 0 ? payload.links[0] : null;
        if (firstLink && !selectedLinkKey) {
          setSelectedLinkKey(`${firstLink.source}__${firstLink.target}`);
        }
      } catch (err) {
        setError(err.message || "Failed to fetch journey flow.");
      } finally {
        setLoading(false);
      }
    }

    loadJourneyFlow();
  }, [
    queryState.path,
    queryState.matchMode,
    queryState.metric,
    queryState.userType,
    queryState.device,
    queryState.country,
    projectId,
    queryState.startDate,
    queryState.endDate,
    queryState.depth,
    queryState.branchLimit,
    queryState.startNode,
    selectedLinkKey,
  ]);

  const selectedLink = useMemo(() => {
    return (journeyData.links || []).find((item) => `${item.source}__${item.target}` === selectedLinkKey) || null;
  }, [journeyData.links, selectedLinkKey]);

  const summaryCards = useMemo(() => {
    const totalTransitions = Number(journeyData.summary?.total_transitions || 0);
    const avgMs = (journeyData.transitions || []).length
      ? Math.round((journeyData.transitions || []).reduce((sum, item) => sum + Number(item.avg_transition_ms || 0), 0) / journeyData.transitions.length)
      : 0;
    const highestDropoff = (journeyData.dropoffs || []).length ? Number(journeyData.dropoffs[0].dropoff_rate || 0) : 0;

    return {
      matchedSessions: Number(journeyData.summary?.matched_sessions || 0),
      matchedUsers: Number(journeyData.summary?.matched_users || 0),
      totalTransitions,
      avgMs,
      highestDropoff,
    };
  }, [journeyData.dropoffs, journeyData.summary, journeyData.transitions]);

  function updateQuery(partial) {
    setQueryState((prev) => ({ ...prev, ...partial }));
  }

  function viewReplayForSelectedLink() {
    if (!selectedLink) return;
    router.push({
      pathname: "/session-replays",
      query: {
        source: selectedLink.source,
        target: selectedLink.target,
      },
    });
  }

  function convertSelectedToFunnel() {
    if (!selectedLink) return;

    const steps = [selectedLink.source, selectedLink.target].filter(Boolean);
    if (steps.length < 2) return;

    router.push({
      pathname: "/funnels",
      query: {
        prefillSteps: steps.join("|"),
        name: `Journey Funnel: ${steps.join(" -> ")}`,
      },
    });
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">User Journeys</h1>
        <p className="mt-1 text-sm text-slate-500">Dynamic path exploration with real filtered session flow, drop-off diagnostics, and action into replay/funnels.</p>
      </section>

      <div className="mx-auto max-w-[1300px] space-y-6 px-4 sm:px-6 lg:px-8">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="p-5 border border-slate-200 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sessions Matched</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{summaryCards.matchedSessions.toLocaleString()}</p>
          </Card>
          <Card className="p-5 border border-slate-200 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Users Matched</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{summaryCards.matchedUsers.toLocaleString()}</p>
          </Card>
          <Card className="p-5 border border-slate-200 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Transition Volume</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{summaryCards.totalTransitions.toLocaleString()}</p>
          </Card>
          <Card className="p-5 border border-slate-200 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Time Between Steps</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDurationMs(summaryCards.avgMs)}</p>
          </Card>
          <Card className="p-5 border border-slate-200 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Highest Drop-off</p>
            <p className="mt-2 text-2xl font-semibold text-red-600">{summaryCards.highestDropoff}%</p>
          </Card>
        </div>

        <Card className="p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Path Search</label>
              <input
                type="text"
                value={queryState.path}
                onChange={(e) => updateQuery({ path: e.target.value, startNode: "" })}
                placeholder="/login"
                className="mt-1 w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Search Mode</label>
              <select
                value={queryState.matchMode}
                onChange={(e) => updateQuery({ matchMode: e.target.value, startNode: "" })}
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="contains">Contains</option>
                <option value="starts_from">Starts from</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Metric</label>
              <div className="mt-1 flex gap-2">
                <Button variant={queryState.metric === "events" ? "primary" : "secondary"} size="sm" onClick={() => updateQuery({ metric: "events" })}>Events</Button>
                <Button variant={queryState.metric === "users" ? "primary" : "secondary"} size="sm" onClick={() => updateQuery({ metric: "users" })}>Users</Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">User Type</label>
              <select value={queryState.userType} onChange={(e) => updateQuery({ userType: e.target.value })} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="returning">Returning</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Device</label>
              <select value={queryState.device} onChange={(e) => updateQuery({ device: e.target.value })} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="all">All devices</option>
                {(journeyData.filters?.devices || []).map((item) => (
                  <option key={`device-${item}`} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Country</label>
              <select value={queryState.country} onChange={(e) => updateQuery({ country: e.target.value })} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="all">All countries</option>
                {(journeyData.filters?.countries || []).map((item) => (
                  <option key={`country-${item}`} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Start Date</label>
              <input type="date" value={queryState.startDate} onChange={(e) => updateQuery({ startDate: e.target.value })} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">End Date</label>
              <input type="date" value={queryState.endDate} onChange={(e) => updateQuery({ endDate: e.target.value })} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${tab === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {item.label}
              </button>
            ))}
          </div>
        </Card>

        {tab === "flow" ? (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card className="p-0 overflow-hidden border border-slate-200">
              <div className="border-b border-slate-100 bg-white p-5">
                <h2 className="font-semibold text-slate-900">Flow Visualization</h2>
                <p className="mt-1 text-sm text-slate-500">Sankey widths represent {metricLabel.toLowerCase()} across matched sessions.</p>
              </div>
              <div className="h-[460px] min-w-0 bg-slate-50/40 p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
                  </div>
                ) : (journeyData.links || []).length > 0 ? (
                  <div className="h-full w-full overflow-auto rounded-lg border border-slate-200 bg-white p-3">
                    <div className="space-y-2">
                      {(journeyData.links || []).slice(0, 20).map((link, index) => {
                        const key = `${link.source}__${link.target}`;
                        const active = key === selectedLinkKey;
                        return (
                          <button
                            key={`flow-${key}-${index}`}
                            onClick={() => setSelectedLinkKey(key)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                          >
                            <p className="text-sm font-semibold text-slate-900">{link.source}{" -> "}{link.target}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {metricLabel}: {Number(link.value || 0).toLocaleString()} | Share: {percent(link.value, summaryCards.totalTransitions)}% | Avg: {formatDurationMs(link.avg_transition_ms)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">No flow data for this query.</div>
                )}
              </div>

              <div className="border-t border-slate-100 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Top transitions (click to inspect)</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {(journeyData.links || []).slice(0, 10).map((link, index) => {
                    const key = `${link.source}__${link.target}`;
                    const active = key === selectedLinkKey;
                    return (
                      <button
                        key={`${key}-${index}`}
                        onClick={() => setSelectedLinkKey(key)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <p className="font-semibold text-slate-900">{link.source}{" -> "}{link.target}</p>
                        <p className="mt-1 text-slate-600">{metricLabel}: {Number(link.value || 0).toLocaleString()} | {Number(link.percentage || 0)}%</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-5 border border-slate-200">
                <h2 className="font-semibold text-slate-900">Path Expansion</h2>
                <p className="mt-1 text-sm text-slate-500">Click a node to expand next steps from that node.</p>
                <div className="mt-4 max-h-[280px] space-y-3 overflow-auto pr-1">
                  {(journeyData.graph?.levels || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No nodes available for expansion.</p>
                  ) : (
                    (journeyData.graph.levels || []).map((level, levelIndex) => (
                      <div key={`level-${levelIndex}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Depth {levelIndex}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(level || []).slice(0, 5).map((node, idx) => (
                            <button
                              key={`${node.id}-${idx}`}
                              onClick={() => updateQuery({ startNode: node.id })}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white"
                              title={`Drop-off: ${Number(node.dropoff_rate || 0)}%`}
                            >
                              {node.id} ({Number(node.count || 0).toLocaleString()})
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-5 border border-slate-200">
                <h2 className="font-semibold text-slate-900">Transition Insights</h2>
                {!selectedLink ? (
                  <p className="mt-3 text-sm text-slate-500">Select a transition from the flow to see count, percentage, timing, and actions.</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{selectedLink.source}{" -> "}{selectedLink.target}</p>
                      <p className="mt-1 text-xs text-slate-600">{metricLabel}: {Number(selectedLink.value || 0).toLocaleString()}</p>
                      <p className="text-xs text-slate-600">Percentage of transitions: {Number(selectedLink.percentage || 0)}%</p>
                      <p className="text-xs text-slate-600">Avg. time between steps: {formatDurationMs(selectedLink.avg_transition_ms)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={viewReplayForSelectedLink}>View session replay</Button>
                      <Button variant="secondary" size="sm" onClick={convertSelectedToFunnel}>Convert to funnel</Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        {tab === "top" ? (
          <Card className="overflow-hidden border border-slate-200 p-0">
            <div className="border-b border-slate-100 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Top Paths</h2>
              <p className="mt-1 text-sm text-slate-500">Most frequent pages in matched journeys.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Path</th>
                    <th className="px-6 py-4 text-right font-medium">Volume</th>
                    <th className="px-6 py-4 text-right font-medium">Users</th>
                    <th className="px-6 py-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">Loading paths...</td></tr>
                  ) : (journeyData.top_paths || []).length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">No paths found for this query.</td></tr>
                  ) : (
                    (journeyData.top_paths || []).map((row, idx) => (
                      <tr key={`${row.page}-${idx}`} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{row.page}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(row.views || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(row.users || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" onClick={() => updateQuery({ startNode: row.page })}>Expand from this</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {tab === "dropoffs" ? (
          <Card className="overflow-hidden border border-slate-200 p-0">
            <div className="border-b border-slate-100 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Drop-off Analysis</h2>
              <p className="mt-1 text-sm text-slate-500">Exit points by step with percent drop-off highlighted.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Step</th>
                    <th className="px-6 py-4 text-right font-medium">Entrants</th>
                    <th className="px-6 py-4 text-right font-medium">Continued</th>
                    <th className="px-6 py-4 text-right font-medium">Drop-off Count</th>
                    <th className="px-6 py-4 text-right font-medium">Drop-off %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">Loading drop-off data...</td></tr>
                  ) : (journeyData.dropoffs || []).length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No drop-off data for this query.</td></tr>
                  ) : (
                    (journeyData.dropoffs || []).map((row, idx) => {
                      const rate = Number(row.dropoff_rate || 0);
                      const rateClass = rate >= 60 ? "text-red-700 bg-red-50 border-red-200" : rate >= 30 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200";
                      return (
                        <tr key={`${row.step}-${idx}`} className="transition-colors hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">{row.step}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(row.entrants || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(row.continued || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(row.dropoff_count || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${rateClass}`}>{rate}%</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {!loading && journeyData.links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No matching journey flow found. Try a broader search mode or relax filters.
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Badge variant="default" className="bg-slate-100 text-slate-700">
            Active Path Filter: {journeyData.effective_path || "(none)"}
          </Badge>
          <Badge variant="default" className="bg-slate-100 text-slate-700">
            Start Node: {queryState.startNode || journeyData.graph?.start || "(auto)"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
