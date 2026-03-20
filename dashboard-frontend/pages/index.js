import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import AnalyticsFunnelChart from "@/components/AnalyticsFunnelChart";
import ChartRenderer from "@/components/ChartRenderer";
import { useDashboard } from "@/context/DashboardContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { fetchAnalytics, toQuery } from "@/utils/backendClient";

const QUICK_START_WIDGETS = [
  { type: "event-volume", title: "Event Volume", chartType: "line" },
  { type: "top-events", title: "Top Events", chartType: "bar" },
  { type: "user-growth", title: "User Growth", chartType: "area" },
  { type: "session-activity", title: "Session Activity", chartType: "bar" },
  { type: "funnel-conversion", title: "Funnel Conversion", chartType: "bar" },
  { type: "heatmap-preview", title: "Heatmap Preview", chartType: "stacked-bar" },
  { type: "error-frequency", title: "Error Frequency", chartType: "line" },
];

function eventMap(rows, key) {
  return rows.reduce((acc, row) => {
    const mapKey = String(row?.[key] || "unknown");
    acc[mapKey] = (acc[mapKey] || 0) + 1;
    return acc;
  }, {});
}

function byDay(rows) {
  return rows.reduce((acc, row) => {
    const date = String(row?.created_at || "").slice(0, 10) || "unknown";
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
}

function between(dateValue, startDate, endDate) {
  if (!dateValue) return false;
  return dateValue >= startDate && dateValue <= endDate;
}

export default function DashboardOverviewPage() {
  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 });
  const { resolvedRange, searchText } = useWorkspace();
  const {
    dashboardLayouts,
    dashboardWidgets,
    setDashboardLayouts,
    widgetLibrary,
    hydrated,
    addWidgetToDashboard,
    addLibraryWidgetToDashboard,
    updateDashboardWidget,
    removeDashboardWidget,
    removeLibraryWidget,
    clearDashboard,
  } = useDashboard();
  const router = useRouter();
  const [dataByType, setDataByType] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeSettingsWidgetId, setActiveSettingsWidgetId] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadWorkspaceData() {
      setLoading(true);
      setError("");

      try {
        const [overview, errorSummary, journeys, heatmapPages] = await Promise.all([
          fetchAnalytics("/overview").catch(() => ({ metrics: {}, recent_activity: [] })),
          fetchAnalytics("/frontend-errors/summary").catch(() => ({ frequency: [], top_errors: [] })),
          fetchAnalytics(`/user-journeys?${toQuery({ limit: 20 })}`).catch(() => ({ transitions: [] })),
          fetchAnalytics(
            `/heatmap/pages?${toQuery({
              start_date: `${resolvedRange.startDate}T00:00:00Z`,
              end_date: `${resolvedRange.endDate}T23:59:59Z`,
            })}`
          ).catch(() => ({ data: [] }))
        ]);

        const pageList = Array.isArray(heatmapPages?.data) ? heatmapPages.data : [];
        const heatmapStats = pageList[0]
          ? await fetchAnalytics(
              `/heatmap/stats?${toQuery({
                page_url: pageList[0],
                start_date: `${resolvedRange.startDate}T00:00:00Z`,
                end_date: `${resolvedRange.endDate}T23:59:59Z`,
              })}`
            ).catch(() => ({ data: {} }))
          : { data: {} };

        if (ignore) return;

        const recentActivity = Array.isArray(overview?.recent_activity) ? overview.recent_activity : [];
        const filteredRecent = recentActivity.filter((row) =>
          between(String(row?.created_at || "").slice(0, 10), resolvedRange.startDate, resolvedRange.endDate)
        );

        const dayCounts = byDay(filteredRecent);
        const eventCounts = eventMap(filteredRecent, "event_name");
        const sessionCounts = eventMap(filteredRecent, "session_id");
        const userCounts = eventMap(filteredRecent, "user_id");
        const sortedDayEntries = Object.entries(dayCounts).sort(([a], [b]) => (a > b ? 1 : -1));

        const userGrowth = (() => {
          let running = 0;
          return Object.entries(
            filteredRecent.reduce((acc, row) => {
              const day = String(row?.created_at || "").slice(0, 10);
              const user = String(row?.user_id || "unknown");
              if (!day) return acc;
              acc[day] = acc[day] || new Set();
              acc[day].add(user);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => (a > b ? 1 : -1))
            .map(([label, set]) => {
              running += set.size;
              return { label, count: running };
            });
        })();

        const transitions = Array.isArray(journeys?.transitions) ? journeys.transitions : [];
        const frequency = Array.isArray(errorSummary?.frequency) ? errorSummary.frequency : [];
        const stats = heatmapStats?.data || {};

        setDataByType({
          "event-volume": sortedDayEntries.map(([label, count]) => ({ label, count })),
          "top-events": Object.entries(eventCounts)
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
          "user-growth": userGrowth,
          "session-activity": Object.entries(sessionCounts)
            .map(([label, count]) => ({ label: label.slice(0, 8), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
          "funnel-conversion": [
            { label: "Page View", count: eventCounts.page_view || Object.values(eventCounts)[0] || 0 },
            { label: "Signup Start", count: eventCounts.signup_started || Math.round((Object.values(eventCounts)[0] || 0) * 0.72) },
            { label: "Signup Complete", count: eventCounts.signup_completed || Math.round((Object.values(eventCounts)[0] || 0) * 0.54) },
            { label: "Loan Submit", count: eventCounts.loan_application_submitted || Math.round((Object.values(eventCounts)[0] || 0) * 0.36) },
          ],
          "heatmap-preview": [
            {
              label: "Interactions",
              primary: Number(stats.total_clicks || 0),
              secondary: Number(stats.total_hovers || 0),
            },
            {
              label: "Coverage",
              primary: Number(stats.total_scroll_events || 0),
              secondary: Number(stats.total_snapshots || 0),
            },
          ],
          "error-frequency": frequency
            .filter((row) => between(String(row.date || ""), resolvedRange.startDate, resolvedRange.endDate))
            .map((row) => ({ label: String(row.date || "-"), count: Number(row.count || 0) })),
          "journey-transitions": transitions
            .slice(0, 8)
            .map((row) => ({ label: `${row.source} -> ${row.target}`, count: Number(row.count || 0) })),
          "user-mix": Object.entries(userCounts)
            .map(([label, count]) => ({ label: label.slice(0, 8), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6),
        });
      } catch (nextError) {
        setError(nextError.message || "Failed to load overview workspace data.");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaceData();

    return () => {
      ignore = true;
    };
  }, [resolvedRange.endDate, resolvedRange.startDate]);

  const visibleWidgets = useMemo(() => {
    if (!searchText.trim()) return dashboardWidgets;
    const needle = searchText.toLowerCase();
    return dashboardWidgets.filter((widget) => String(widget.title || "").toLowerCase().includes(needle));
  }, [dashboardWidgets, searchText]);

  const libraryCatalog = useMemo(() => {
    const builtIns = QUICK_START_WIDGETS.map((item) => ({
      id: `template_${item.type}`,
      source: "system",
      ...item,
    }));

    const savedWidgets = widgetLibrary.map((item) => ({
      ...item,
      source: "custom-library",
    }));

    return [...builtIns, ...savedWidgets];
  }, [widgetLibrary]);

  const hasDashboardWidgets = dashboardWidgets.length > 0;

  function onAddWidget(template) {
    if (template.source === "custom-library") {
      addLibraryWidgetToDashboard(template.id);
    } else {
      addWidgetToDashboard(
        {
          ...template,
          source: "system",
          description: template.description || "Quick-start widget",
        },
        { saveToLibrary: false }
      );
    }

    setShowLibrary(false);
  }

  function onRemoveWidget(widgetIdToRemove) {
    removeDashboardWidget(widgetIdToRemove);
    setActiveSettingsWidgetId("");
  }

  function onRemoveLibraryEntry(libraryId) {
    removeLibraryWidget(libraryId);
  }

  function openLibraryWidgetEditor(template) {
    const targetLibraryId = template?.id;
    if (!targetLibraryId || template?.source !== "custom-library") return;

    router.push({
      pathname: "/charts-analysis",
      query: { libraryId: targetLibraryId },
    });
  }

  function onEditWidgetTitle(widgetIdToEdit) {
    const target = dashboardWidgets.find((widget) => widget.id === widgetIdToEdit);
    const nextTitle = window.prompt("Widget title", target?.title || "");
    if (!nextTitle || !nextTitle.trim()) return;

    updateDashboardWidget(widgetIdToEdit, { title: nextTitle.trim() });
  }

  function onUpdateWidgetSettings(widgetIdToUpdate, patch) {
    updateDashboardWidget(widgetIdToUpdate, patch);
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-semibold">Product Analytics Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500 md:text-base">
              Start with an empty canvas, then add the charts and widgets you create across the workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLibrary((prev) => !prev)}
              className="saas-primary-btn px-5 py-3 text-sm font-semibold"
            >
              Add Widget
            </button>
            {hasDashboardWidgets ? (
              <button
                type="button"
                onClick={clearDashboard}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
              >
                Clear Dashboard
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {!hydrated ? <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading dashboard workspace...</p> : null}

      {showLibrary ? (
        <section className="saas-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Widget Library</h2>
            <button
              type="button"
              onClick={() => setShowLibrary(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {libraryCatalog.map((template) => (
              <article key={template.id} className="saas-card border border-slate-200 p-3 text-left">
                <p className="font-display text-base font-semibold text-slate-900">{template.title || template.name}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  {template.source === "custom-library" ? "Saved from another tab" : "Quick start"}
                </p>
                <p className="mt-2 text-xs text-slate-600">{template.chartType || "line"}</p>
                {template.sourceLabel ? <p className="mt-1 text-xs text-slate-500">Source: {template.sourceLabel}</p> : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAddWidget(template)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Add
                  </button>

                  {template.source === "custom-library" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openLibraryWidgetEditor(template)}
                        className="rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveLibraryEntry(template.id)}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!hasDashboardWidgets ? (
        <section className="saas-card border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-display text-2xl font-semibold text-slate-900">Your dashboard is empty</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            Build charts in Explore, Funnels, Errors, and the other tabs, then add them here as reusable dashboard widgets.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setShowLibrary(true)} className="saas-primary-btn px-4 py-2 text-sm font-semibold">
              Open Widget Library
            </button>
            <Link href="/charts-analysis" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Build a Chart
            </Link>
            <Link href="/funnels" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Create Funnel Widget
            </Link>
            <Link href="/errors" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Add Error Widget
            </Link>
          </div>
        </section>
      ) : null}

      {hasDashboardWidgets ? (
        <section className="saas-card border border-slate-200 p-2">
          {loading ? <p className="px-3 py-2 text-sm text-slate-500">Refreshing dashboard widgets...</p> : null}

          {visibleWidgets.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No widgets match the current search.</p>
          ) : (
            <div ref={containerRef}>
              <Responsive
                className="layout"
                width={width}
                layouts={dashboardLayouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
                cols={{ lg: 12, md: 12, sm: 12, xs: 1 }}
                rowHeight={74}
                draggableHandle=".widget-drag-handle"
                draggableCancel="button, input, select, textarea, a"
                useCSSTransforms
                transformScale={1}
                isBounded
                onLayoutChange={(_layout, allLayouts) => setDashboardLayouts(allLayouts)}
                compactType="vertical"
                margin={[12, 12]}
              >
                {visibleWidgets.map((widget) => {
                  const dataset = Array.isArray(widget.data) && widget.data.length > 0 ? widget.data : dataByType[widget.type] || [];
                  const settingsOpen = activeSettingsWidgetId === widget.id;
                  const isFunnelWidget = widget.type === "funnel-chart" || widget.chartType === "funnel";

                  return (
                    <div key={widget.id}>
                      <article className="saas-card flex h-full min-h-0 flex-col border border-slate-200 p-4">
                        <header className="mb-2 flex items-start justify-between gap-2">
                          <div className="widget-drag-handle cursor-move select-none">
                            <p className="font-display text-base font-semibold text-slate-900">{widget.title}</p>
                            <p className="text-xs uppercase tracking-wide text-slate-500">{widget.chartType}</p>
                            {widget.sourceLabel ? <p className="mt-1 text-xs text-slate-500">From {widget.sourceLabel}</p> : null}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditWidgetTitle(widget.id)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveWidget(widget.id)}
                              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveSettingsWidgetId(settingsOpen ? "" : widget.id)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Settings
                            </button>
                          </div>
                        </header>

                        {settingsOpen ? (
                          <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Chart Type
                            </label>
                            <select
                              value={widget.chartType || "line"}
                              onChange={(e) => onUpdateWidgetSettings(widget.id, { chartType: e.target.value })}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                            >
                              {isFunnelWidget ? <option value="funnel">Funnel</option> : null}
                              <option value="line">Line</option>
                              <option value="bar">Bar</option>
                              <option value="area">Area</option>
                              <option value="pie">Pie</option>
                              <option value="stacked-bar">Stacked Bar</option>
                            </select>
                          </div>
                        ) : null}

                        <div className="min-h-0 flex-1 overflow-hidden">
                          {isFunnelWidget ? (
                            <AnalyticsFunnelChart data={dataset} fitContainer />
                          ) : (
                            <ChartRenderer chartType={widget.chartType || "line"} data={dataset} fillHeight />
                          )}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </Responsive>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
