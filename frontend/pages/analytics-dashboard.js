import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ANALYTICS_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE || "http://localhost:4001";
const GROUP_BY_OPTIONS = ["event_name", "page", "user_id"];
const CHART_TYPES = ["line", "bar", "pie", "area"];
const PIE_COLORS = ["#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#14b8a6"];
const BREAKPOINT_COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

const ResponsiveGridLayout = dynamic(
  () =>
    import("react-grid-layout").then((mod) => {
      const { Responsive, WidthProvider } = mod;
      return { default: WidthProvider(Responsive) };
    }),
  { ssr: false }
);

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function buildEventsParam(selectedEvents) {
  if (!Array.isArray(selectedEvents) || selectedEvents.length === 0) return "";
  return selectedEvents.map((item) => encodeURIComponent(item)).join(",");
}

function getDefaultWidgetWidth(cols) {
  if (cols >= 10) return Math.floor(cols / 2);
  return cols;
}

function syncLayouts(prevLayouts, chartIds) {
  const next = {};

  for (const [bp, cols] of Object.entries(BREAKPOINT_COLS)) {
    const current = prevLayouts?.[bp] || [];
    const existing = current.filter((item) => chartIds.includes(item.i));
    const existingIds = new Set(existing.map((item) => item.i));
    const missingIds = chartIds.filter((id) => !existingIds.has(id));

    let y = existing.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0);
    const appended = missingIds.map((id) => {
      const entry = { i: id, x: 0, y, w: getDefaultWidgetWidth(cols), h: 5 };
      y += 5;
      return entry;
    });

    next[bp] = [...existing, ...appended];
  }

  return next;
}

function ChartRenderer({ chartType, data, fillHeight = false }) {
  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 ${
          fillHeight ? "h-full min-h-[240px]" : "h-[320px]"
        }`}
      >
        No data for this configuration.
      </div>
    );
  }

  const pieData = data.map((item) => ({ name: item.label, value: Number(item.count || 0) }));

  return (
    <div className={`w-full ${fillHeight ? "h-full min-h-[240px]" : "h-[320px]"}`}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "line" ? (
          <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : null}

        {chartType === "bar" ? (
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#0f172a" radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : null}

        {chartType === "area" ? (
          <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#bae6fd" strokeWidth={2} />
          </AreaChart>
        ) : null}

        {chartType === "pie" ? (
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={112} label>
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const [charts, setCharts] = useState([]);
  const [layouts, setLayouts] = useState({ lg: [], md: [], sm: [], xs: [], xxs: [] });
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [editingChartId, setEditingChartId] = useState("");
  const [currentQuery, setCurrentQuery] = useState({
    name: "",
    selectedEvents: [],
    chartType: "line",
    groupBy: "event_name",
  });

  const [eventOptions, setEventOptions] = useState([]);
  const [eventSearch, setEventSearch] = useState("");

  const [previewData, setPreviewData] = useState([]);
  const [chartDataById, setChartDataById] = useState({});

  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  const hasAnyLayoutEntries = useMemo(
    () => Object.values(layouts).some((entries) => Array.isArray(entries) && entries.length > 0),
    [layouts]
  );

  useEffect(() => {
    setLayouts((prev) => syncLayouts(prev, charts.map((chart) => chart.id)));
  }, [charts]);

  useEffect(() => {
    if (!isArrangeMode || charts.length === 0) return;
    setLayouts((prev) => syncLayouts(prev, charts.map((chart) => chart.id)));
  }, [isArrangeMode, charts]);

  useEffect(() => {
    async function loadEventOptions() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${ANALYTICS_BASE}/analytics/events?groupBy=event_name`);
        if (!response.ok) throw new Error(`Failed to load events (${response.status})`);

        const rows = await response.json();
        const options = Array.isArray(rows)
          ? rows
              .map((row) => row.label)
              .filter(Boolean)
              .filter((value, index, arr) => arr.indexOf(value) === index)
          : [];

        setEventOptions(options);
      } catch (err) {
        setError(err.message || "Unable to load events for query builder.");
      } finally {
        setLoading(false);
      }
    }

    loadEventOptions();
  }, []);

  useEffect(() => {
    async function loadPreview() {
      try {
        setPreviewLoading(true);
        const params = new URLSearchParams();
        params.set("groupBy", currentQuery.groupBy || "event_name");

        const eventParam = buildEventsParam(currentQuery.selectedEvents);
        if (eventParam) {
          params.set("events", eventParam);
        }

        const response = await fetch(`${ANALYTICS_BASE}/analytics/events?${params.toString()}`);
        if (!response.ok) throw new Error(`Preview query failed (${response.status})`);

        const rows = await response.json();
        setPreviewData(Array.isArray(rows) ? rows : []);
      } catch {
        setPreviewData([]);
      } finally {
        setPreviewLoading(false);
      }
    }

    loadPreview();
  }, [currentQuery.selectedEvents, currentQuery.groupBy, currentQuery.chartType]);

  useEffect(() => {
    async function loadSavedChartsData() {
      if (charts.length === 0) {
        setChartDataById({});
        return;
      }

      const results = await Promise.all(
        charts.map(async (chart) => {
          try {
            const params = new URLSearchParams();
            params.set("groupBy", chart.groupBy || "event_name");
            const eventParam = buildEventsParam(chart.selectedEvents);
            if (eventParam) {
              params.set("events", eventParam);
            }

            const response = await fetch(`${ANALYTICS_BASE}/analytics/events?${params.toString()}`);
            if (!response.ok) return [chart.id, []];

            const rows = await response.json();
            return [chart.id, Array.isArray(rows) ? rows : []];
          } catch {
            return [chart.id, []];
          }
        })
      );

      setChartDataById(Object.fromEntries(results));
    }

    loadSavedChartsData();
  }, [charts]);

  const filteredEventOptions = useMemo(() => {
    if (!eventSearch) return eventOptions;
    const needle = eventSearch.toLowerCase();
    return eventOptions.filter((item) => item.toLowerCase().includes(needle));
  }, [eventOptions, eventSearch]);

  function addEventToCurrentQuery(name) {
    setCurrentQuery((prev) => {
      if (prev.selectedEvents.includes(name)) return prev;
      return { ...prev, selectedEvents: [...prev.selectedEvents, name] };
    });
  }

  function removeEventFromCurrentQuery(name) {
    setCurrentQuery((prev) => ({ ...prev, selectedEvents: prev.selectedEvents.filter((item) => item !== name) }));
  }

  function saveChart() {
    const normalized = {
      id: editingChartId || generateId(),
      name: currentQuery.name.trim() || "Untitled Chart",
      chartType: currentQuery.chartType,
      selectedEvents: currentQuery.selectedEvents,
      groupBy: currentQuery.groupBy,
    };

    setCharts((prev) => {
      if (!editingChartId) {
        return [...prev, normalized];
      }

      return prev.map((chart) => (chart.id === editingChartId ? normalized : chart));
    });

    setEditingChartId("");
    setCurrentQuery((prev) => ({ ...prev, name: "", selectedEvents: [] }));
  }

  function editChart(chart) {
    setEditingChartId(chart.id);
    setCurrentQuery({
      name: chart.name,
      selectedEvents: chart.selectedEvents,
      chartType: chart.chartType,
      groupBy: chart.groupBy,
    });
  }

  function deleteChart(chartId) {
    setCharts((prev) => prev.filter((chart) => chart.id !== chartId));
    if (editingChartId === chartId) {
      setEditingChartId("");
      setCurrentQuery((prev) => ({ ...prev, name: "", selectedEvents: [] }));
    }
  }

  function toggleArrangeMode() {
    setIsArrangeMode((prev) => {
      const next = !prev;
      if (next) {
        // Start from a clean visible layout to avoid stale/off-screen coordinates.
        setLayouts(syncLayouts({}, charts.map((chart) => chart.id)));
      }
      return next;
    });
  }

  function resetWidgetLayout() {
    setLayouts(syncLayouts({}, charts.map((chart) => chart.id)));
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-8">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-semibold text-slate-900">Product Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Build, preview, and save query-driven charts from live backend data.</p>
      </section>

      <section className="mx-auto max-w-[1300px] space-y-4 px-4 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Query Builder</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Chart Name</label>
              <input
                type="text"
                value={currentQuery.name}
                onChange={(e) => setCurrentQuery((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Revenue by page"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Chart Type</label>
              <select
                value={currentQuery.chartType}
                onChange={(e) => setCurrentQuery((prev) => ({ ...prev, chartType: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {CHART_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type[0].toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Group By (Optional)</label>
              <select
                value={currentQuery.groupBy}
                onChange={(e) => setCurrentQuery((prev) => ({ ...prev, groupBy: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {GROUP_BY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={saveChart}
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {editingChartId ? "Update Chart" : "Save Chart"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Event Selector</label>
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search events"
                className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                size={8}
                onChange={(e) => {
                  if (e.target.value) addEventToCurrentQuery(e.target.value);
                }}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
              >
                {filteredEventOptions.map((eventName) => (
                  <option key={eventName} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Events</p>
              <div className="mt-2 flex min-h-[44px] flex-wrap gap-2">
                {currentQuery.selectedEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No events selected. Preview will show all events.</p>
                ) : (
                  currentQuery.selectedEvents.map((eventName) => (
                    <button
                      key={eventName}
                      type="button"
                      onClick={() => removeEventFromCurrentQuery(eventName)}
                      className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {eventName} x
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900">Live Chart Preview</h2>
            {previewLoading ? <span className="text-xs text-slate-500">Refreshing preview...</span> : null}
          </div>
          <ChartRenderer chartType={currentQuery.chartType} data={previewData} />
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">Saved Charts Dashboard</h2>
            {charts.length > 0 ? (
              <div className="flex items-center gap-2">
                {isArrangeMode ? (
                  <button
                    type="button"
                    onClick={resetWidgetLayout}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                  >
                    Reset Layout
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={toggleArrangeMode}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  {isArrangeMode ? "Exit Arrange Mode" : "Arrange Widgets"}
                </button>
              </div>
            ) : null}
          </div>
          {loading ? <p className="mt-2 text-sm text-slate-600">Loading event catalog...</p> : null}
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

          {!loading && charts.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">
              No saved charts yet. Build a query and click Save Chart.
            </p>
          ) : null}

          {charts.length > 0 ? (
            <div className="mt-3">
              {isArrangeMode && hasAnyLayoutEntries ? (
                <div style={{ minHeight: 320 }}>
                  <ResponsiveGridLayout
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={BREAKPOINT_COLS}
                    rowHeight={86}
                    margin={[12, 12]}
                    compactType="vertical"
                    draggableHandle=".widget-drag-handle"
                    onLayoutChange={(_, allLayouts) =>
                      setLayouts((prev) =>
                        syncLayouts(
                          {
                            ...prev,
                            ...allLayouts,
                          },
                          charts.map((chart) => chart.id)
                        )
                      )
                    }
                  >
                    {charts.map((chart) => (
                      <div key={chart.id}>
                        <article className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 p-3">
                          <header className="widget-drag-handle mb-2 flex cursor-move items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                            <div>
                              <p className="font-display text-base font-semibold text-slate-900">{chart.name}</p>
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                {chart.chartType} | group by {chart.groupBy}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => editChart(chart)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteChart(chart.id)}
                                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </header>
                          <div className="min-h-0 flex-1">
                            <ChartRenderer chartType={chart.chartType} data={chartDataById[chart.id] || []} fillHeight />
                          </div>
                        </article>
                      </div>
                    ))}
                  </ResponsiveGridLayout>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {charts.map((chart) => (
                    <article key={chart.id} className="rounded-xl border border-slate-200 p-3">
                      <header className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-display text-base font-semibold text-slate-900">{chart.name}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {chart.chartType} | group by {chart.groupBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editChart(chart)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteChart(chart.id)}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </header>
                      <ChartRenderer chartType={chart.chartType} data={chartDataById[chart.id] || []} />
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
