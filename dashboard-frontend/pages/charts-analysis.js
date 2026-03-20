import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ChartRenderer from "@/components/ChartRenderer";
import { useDashboard } from "@/context/DashboardContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { fetchAnalytics } from "@/utils/backendClient";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

const CHART_TYPES = ["line", "bar", "pie", "area", "stacked-bar"];
const GROUP_BY_OPTIONS = ["event_name", "page", "user_id", "session_id"];

function between(dateValue, startDate, endDate) {
  if (!dateValue) return false;
  return dateValue >= startDate && dateValue <= endDate;
}

export default function ChartsAnalysisPage() {
  const router = useRouter();
  const { resolvedRange } = useWorkspace();
  const {
    addWidgetToDashboard,
    addLibraryWidgetToDashboard,
    removeLibraryWidget,
    updateLibraryWidget,
    widgetLibrary,
  } = useDashboard();
  const [recentActivityRows, setRecentActivityRows] = useState([]);
  const [eventOptions, setEventOptions] = useState([]);
  const [error, setError] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [query, setQuery] = useState({
    name: "",
    chartType: "line",
    groupBy: "event_name",
    breakdown: "none",
    filterText: "",
    selectedEvents: [],
    startDate: "",
    endDate: "",
  });

  const analyses = useMemo(
    () => widgetLibrary.filter((item) => item.sourcePage === "/charts-analysis"),
    [widgetLibrary]
  );

  const filteredEventOptions = useMemo(() => {
    if (!eventSearch.trim()) return eventOptions;
    const needle = eventSearch.toLowerCase();
    return eventOptions.filter((item) => item.toLowerCase().includes(needle));
  }, [eventOptions, eventSearch]);

  const effectiveRange = useMemo(
    () => ({
      startDate: query.startDate || resolvedRange.startDate,
      endDate: query.endDate || resolvedRange.endDate,
    }),
    [query.endDate, query.startDate, resolvedRange.endDate, resolvedRange.startDate]
  );

  useEffect(() => {
    async function loadActivityData() {
      try {
        setError("");
        const overview = await fetchAnalytics("/overview").catch(() => ({ recent_activity: [] }));
        const rows = Array.isArray(overview?.recent_activity) ? overview.recent_activity : [];
        setRecentActivityRows(rows);

        const options = rows
          .map((row) => String(row.event_name || ""))
          .filter(Boolean)
          .filter((value, index, array) => array.indexOf(value) === index)
          .sort((a, b) => a.localeCompare(b));
        setEventOptions(options);
      } catch (nextError) {
        setError(nextError.message || "Unable to initialize analysis workspace.");
      }
    }

    loadActivityData();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const rawLibraryId = router.query.libraryId;
    const libraryId = Array.isArray(rawLibraryId) ? rawLibraryId[0] : rawLibraryId;
    if (!libraryId) return;

    const match = widgetLibrary.find((item) => item.id === libraryId);
    if (!match) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery((prev) => ({
      ...prev,
      name: match.title || "",
      chartType: match.chartType || "line",
      groupBy: match.groupBy || "event_name",
      breakdown: match.breakdown || "none",
      filterText: match.filterText || "",
      selectedEvents: Array.isArray(match.selectedEvents) ? match.selectedEvents : [],
      startDate: match.startDate || "",
      endDate: match.endDate || "",
    }));
  }, [router.isReady, router.query.libraryId, widgetLibrary]);

  const editingLibraryId = useMemo(() => {
    if (!router.isReady) return "";
    const rawLibraryId = router.query.libraryId;
    const libraryId = Array.isArray(rawLibraryId) ? rawLibraryId[0] : rawLibraryId;
    if (!libraryId) return "";
    return widgetLibrary.some((item) => item.id === libraryId) ? libraryId : "";
  }, [router.isReady, router.query.libraryId, widgetLibrary]);

  const previewData = useMemo(() => {
    const selectedSet = new Set(query.selectedEvents || []);
    const inputFilter = String(query.filterText || "").trim().toLowerCase();
    const grouped = {};

    recentActivityRows
      .filter((row) => between(String(row.created_at || "").slice(0, 10), effectiveRange.startDate, effectiveRange.endDate))
      .filter((row) => (selectedSet.size ? selectedSet.has(String(row.event_name || "")) : true))
      .filter((row) => {
        if (!inputFilter) return true;
        return (
          String(row.event_name || "").toLowerCase().includes(inputFilter) ||
          String(row.page || "").toLowerCase().includes(inputFilter) ||
          String(row.user_id || "").toLowerCase().includes(inputFilter)
        );
      })
      .forEach((row) => {
        const key = String(row?.[query.groupBy] || "unknown");
        grouped[key] = (grouped[key] || 0) + 1;
      });

    const rows = Object.entries(grouped)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    if (query.chartType !== "stacked-bar") {
      return rows;
    }

    return rows.map((row) => ({
      ...row,
      primary: Math.round(row.count * 0.65),
      secondary: row.count - Math.round(row.count * 0.65),
    }));
  }, [effectiveRange.endDate, effectiveRange.startDate, query, recentActivityRows]);

  const previewLoading = useMemo(
    () => recentActivityRows.length === 0 && !error,
    [error, recentActivityRows.length]
  );

  function addEvent(eventName) {
    setQuery((prev) => {
      if (prev.selectedEvents.includes(eventName)) return prev;
      return { ...prev, selectedEvents: [...prev.selectedEvents, eventName] };
    });
  }

  function removeEvent(eventName) {
    setQuery((prev) => ({
      ...prev,
      selectedEvents: prev.selectedEvents.filter((item) => item !== eventName),
    }));
  }

  function addToDashboard() {
    addWidgetToDashboard({
      type: "custom-query",
      title: query.name.trim() || "Custom Analysis",
      chartType: query.chartType,
      groupBy: query.groupBy,
      breakdown: query.breakdown,
      filterText: query.filterText,
      selectedEvents: query.selectedEvents,
      startDate: effectiveRange.startDate,
      endDate: effectiveRange.endDate,
      data: previewData,
      sourcePage: "/charts-analysis",
      sourceLabel: "Explore / Analysis",
      description: `Grouped by ${query.groupBy}`,
    });
    setQuery((prev) => ({ ...prev, name: "" }));
  }

  function saveWidgetChanges() {
    if (!editingLibraryId) return;

    updateLibraryWidget(editingLibraryId, {
      title: query.name.trim() || "Custom Analysis",
      chartType: query.chartType,
      groupBy: query.groupBy,
      breakdown: query.breakdown,
      filterText: query.filterText,
      selectedEvents: query.selectedEvents,
      startDate: effectiveRange.startDate,
      endDate: effectiveRange.endDate,
      data: previewData,
      sourcePage: "/charts-analysis",
      sourceLabel: "Explore / Analysis",
      description: `Grouped by ${query.groupBy}`,
    });
  }

  function clearEditingMode() {
    router.replace("/charts-analysis", undefined, { shallow: true });
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Explore / Analysis</h1>
            <p className="mt-1 text-sm text-slate-500">
              Build live chart queries and pin them as reusable widgets.
            </p>
          </div>
          {editingLibraryId ? (
            <div className="flex items-center gap-3 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm text-blue-800 shadow-sm animate-in fade-in zoom-in">
              <span className="flex items-center gap-1.5 font-medium"><Icons.Edit className="w-4 h-4" /> Editing Widget</span>
              <div className="w-px h-4 bg-blue-200"></div>
              <button
                type="button"
                onClick={clearEditingMode}
                className="font-semibold text-blue-700 hover:text-blue-900 transition-colors"
               >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
            <Icons.Info className="w-5 h-5 text-red-500" />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="p-5 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Icons.Activity className="w-5 h-5 text-slate-400" />
              Query Builder
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Analysis Name</label>
                <input
                  type="text"
                  value={query.name}
                  onChange={(e) => setQuery((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Event Performance by Page"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Chart Type</label>
                  <select
                    value={query.chartType}
                    onChange={(e) => setQuery((prev) => ({ ...prev, chartType: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white"
                  >
                    {CHART_TYPES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Group By</label>
                  <select
                    value={query.groupBy}
                    onChange={(e) => setQuery((prev) => ({ ...prev, groupBy: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white"
                  >
                    {GROUP_BY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</label>
                  <select
                    value={query.breakdown}
                    onChange={(e) => setQuery((prev) => ({ ...prev, breakdown: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="none">None</option>
                    <option value="device">Device</option>
                    <option value="page">Page</option>
                    <option value="user">User Segment</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</label>
                  <input
                    type="text"
                    value={query.filterText}
                    onChange={(e) => setQuery((prev) => ({ ...prev, filterText: e.target.value }))}
                    placeholder="e.g. signup"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date Start</label>
                  <input
                    type="date"
                    value={query.startDate}
                    onChange={(e) => setQuery((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date End</label>
                  <input
                    type="date"
                    value={query.endDate}
                    onChange={(e) => setQuery((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Event Selector</label>
                <div className="relative">
                  <Icons.Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search events"
                    className="mb-2 w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <select
                  size={6}
                  onChange={(e) => e.target.value && addEvent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-blue-500"
                >
                  {filteredEventOptions.map((eventName) => (
                    <option key={eventName} value={eventName} className="p-1 rounded-sm hover:bg-slate-50 cursor-pointer">
                      {eventName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 bg-slate-50/50">
                {query.selectedEvents.length === 0 ? (
                  <p className="text-sm text-slate-500 w-full text-center">No events selected. Showing all visible events.</p>
                ) : (
                  query.selectedEvents.map((eventName) => (
                    <Badge
                      key={eventName}
                      variant="secondary"
                      className="gap-1.5 pl-2.5 pr-1 py-1"
                    >
                      {eventName}
                      <button
                        type="button"
                        onClick={() => removeEvent(eventName)}
                        className="rounded-full p-0.5 hover:bg-slate-200 transition-colors"
                      >
                         <Icons.X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
                <Button
                  variant="default"
                  onClick={addToDashboard}
                  className="w-full shadow-sm"
                >
                  <Icons.Plus className="w-4 h-4 mr-2" />
                  Add to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={saveWidgetChanges}
                  disabled={!editingLibraryId}
                  className="w-full"
                >
                  <Icons.Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 shadow-sm flex flex-col min-h-[500px]">
            <div className="mb-4 flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Icons.BarChart className="w-5 h-5 text-slate-400" />
                Live Chart Preview
              </h2>
              {previewLoading ? (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 px-2.5 py-1 bg-slate-100 rounded-full animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Refreshing...
                </div>
              ) : null}
            </div>
            <div className="flex-1 min-h-[400px]">
              <ChartRenderer chartType={query.chartType} data={previewData} />
            </div>
          </Card>
        </section>

        <Card className="p-0 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-white">
            <h2 className="font-display text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Icons.LayoutDashboard className="w-5 h-5 text-slate-400" />
              Pinned Analyses
            </h2>
          </div>
          
          <div className="p-5 bg-slate-50/50">
            {analyses.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center flex flex-col items-center">
                 <Icons.BarChart className="w-10 h-10 text-slate-300 mb-3" />
                 <h3 className="text-sm font-semibold text-slate-900">No analyses pinned yet</h3>
                 <p className="mt-1 text-sm text-slate-500 max-w-sm">
                   Build a query using the builder above and click &apos;Add to Dashboard&apos; to save it here.
                 </p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {analyses.map((analysis) => (
                  <Card key={analysis.id} className="p-4 bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <header className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-base font-semibold text-slate-900">{analysis.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                           <Badge variant="outline" className="text-xs font-normal text-slate-500">{analysis.chartType}</Badge>
                           <span className="text-xs text-slate-400">&bull;</span>
                           <span className="text-xs text-slate-500 font-medium">Group by: {analysis.groupBy}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg p-1 border border-slate-100">
                        <button
                          type="button"
                          onClick={() => addLibraryWidgetToDashboard(analysis.id)}
                          className="p-1.5 rounded-md text-slate-600 hover:text-blue-600 hover:bg-white hover:shadow-sm transition-all"
                          title="Add to Dashboard Again"
                        >
                          <Icons.Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push({
                              pathname: "/charts-analysis",
                              query: { libraryId: analysis.id },
                            })
                          }
                          className="p-1.5 rounded-md text-slate-600 hover:text-blue-600 hover:bg-white hover:shadow-sm transition-all"
                          title="Edit"
                        >
                          <Icons.Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLibraryWidget(analysis.id)}
                          className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-white hover:shadow-sm transition-all"
                          title="Remove"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </header>

                    <div className="h-64 border-t border-slate-100 pt-4">
                      <ChartRenderer
                        chartType={analysis.chartType}
                        data={analysis.data || []}
                        emptyLabel="No preview data was stored for this analysis."
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
