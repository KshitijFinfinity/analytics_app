import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard } from "@/context/DashboardContext";
import { fetchAnalytics, toQuery } from "@/utils/backendClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

export default function ErrorsPage() {
  const { resolvedRange } = useWorkspace();
  const { addWidgetToDashboard } = useDashboard();
  const [summary, setSummary] = useState({
    top_errors: [],
    frequency: [],
    replay_sessions: [],
    sessions_affected: 0,
    total_errors: 0,
    resolved_errors: 0,
    unresolved_errors: 0,
  });
  const [eventsPayload, setEventsPayload] = useState({ by_page: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [logsLoadingId, setLogsLoadingId] = useState("");
  const [logsModal, setLogsModal] = useState({ open: false, event: null, related_events: [] });
  const [toast, setToast] = useState("");
  const itemsPerPage = 8;

  const topErrors = useMemo(
    () =>
      (summary.top_errors || []).map((item) => ({
        label: String(item.message || "Unknown").slice(0, 48),
        count: Number(item.count || 0),
      })),
    [summary.top_errors]
  );

  const errorFrequency = useMemo(
    () =>
      (summary.frequency || [])
        .filter((row) => {
          const date = String(row.date || "");
          return date >= resolvedRange.startDate && date <= resolvedRange.endDate;
        })
        .map((row) => ({ label: row.date, count: Number(row.count || 0) })),
    [resolvedRange.endDate, resolvedRange.startDate, summary.frequency]
  );

  const errorsByPage = useMemo(
    () =>
      (eventsPayload.by_page || []).map((item) => ({
        label: String(item.page || "(unknown)").slice(0, 36),
        count: Number(item.count || 0),
      })),
    [eventsPayload.by_page]
  );

  const errorEvents = useMemo(() => eventsPayload.events || [], [eventsPayload.events]);

  async function copyDebugPayload(event) {
    const payload = {
      id: event.id,
      message: event.message,
      error_type: event.error_type,
      page: event.page,
      page_url: event.page_url,
      source: event.source,
      line: event.line,
      column: event.column,
      stack: event.stack,
      user_id: event.user_id,
      session_id: event.session_id,
      user_agent: event.user_agent,
      resolved: Boolean(event.resolved),
      resolved_by: event.resolved_by || null,
      resolved_at: event.resolved_at || null,
      resolution_note: event.resolution_note || null,
      seen_at: event.timestamp || event.created_at || null,
    };

    const text = JSON.stringify(payload, null, 2);
    await navigator.clipboard.writeText(text);
    setToast("Debug payload copied");
  }

  async function loadErrorLogs(eventId) {
    setLogsLoadingId(eventId);
    try {
      const payload = await fetchAnalytics(`/frontend-errors/${encodeURIComponent(eventId)}/logs`, {
        skipCache: true,
      });
      setLogsModal({
        open: true,
        event: payload?.event || null,
        related_events: Array.isArray(payload?.related_events) ? payload.related_events : [],
      });
    } finally {
      setLogsLoadingId("");
    }
  }

  function addErrorWidget({ title, chartType, data, description }) {
    addWidgetToDashboard({
      type: "error-widget",
      title,
      chartType,
      data,
      sourcePage: "/errors",
      sourceLabel: "Errors",
      description,
    });
  }

  async function refreshErrors() {
    try {
      setLoading(true);
      setError("");

      const [summaryPayload, eventsData] = await Promise.all([
        fetchAnalytics("/frontend-errors/summary", { skipCache: true }).catch(() => ({
          top_errors: [],
          frequency: [],
          replay_sessions: [],
          sessions_affected: 0,
          total_errors: 0,
          resolved_errors: 0,
          unresolved_errors: 0,
        })),
        fetchAnalytics(
          `/frontend-errors/events?${toQuery({ limit: 120, status: statusFilter })}`,
          { skipCache: true }
        ).catch(() => ({ by_page: [], events: [] })),
      ]);

      setSummary(
        summaryPayload || {
          top_errors: [],
          frequency: [],
          replay_sessions: [],
          sessions_affected: 0,
          total_errors: 0,
          resolved_errors: 0,
          unresolved_errors: 0,
        }
      );
      setEventsPayload(eventsData || { by_page: [], events: [] });
    } catch (err) {
      setError(err.message || "Unable to load errors summary.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleResolve(eventItem) {
    if (!eventItem?.id) return;

    const markResolved = !Boolean(eventItem.resolved);
    setActionLoadingId(eventItem.id);
    try {
      await fetchAnalytics(`/frontend-errors/${encodeURIComponent(eventItem.id)}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolved: markResolved,
          resolved_by: "dashboard_user",
          resolution_note: markResolved ? "Resolved from dashboard" : "",
        }),
        skipCache: true,
      });

      setToast(markResolved ? "Error marked as resolved" : "Error reopened");
      await refreshErrors();
    } catch (err) {
      setError(err.message || "Could not update error state.");
    } finally {
      setActionLoadingId("");
    }
  }

  useEffect(() => {
    refreshErrors();
  }, [resolvedRange.endDate, resolvedRange.startDate, statusFilter]);

  const filteredEvents = useMemo(() => {
    return errorEvents.filter(event => 
      (event.message || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.page || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.user_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.error_type || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.source || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [errorEvents, searchTerm]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);

  return (
    <div className="space-y-8 pb-10">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Errors</h1>
        <p className="mt-1 text-sm text-slate-500">Monitor frontend exceptions and debug efficiently.</p>
      </section>

      <section className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 space-y-6">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {toast ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {toast}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All errors</option>
              <option value="unresolved">Unresolved only</option>
              <option value="resolved">Resolved only</option>
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setToast("");
              refreshErrors();
            }}
          >
            Refresh
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Card className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
               <Icons.Filter className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Errors</p>
              <p className="font-display text-3xl font-semibold text-slate-900 leading-none mt-1">
                {Number(summary.total_errors || 0).toLocaleString()}
              </p>
            </div>
          </Card>
          
          <Card className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
               <Icons.Expand className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Sessions Affected</p>
              <p className="font-display text-3xl font-semibold text-slate-900 leading-none mt-1">
                {Number(summary.sessions_affected || 0).toLocaleString()}
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-600">
              <Icons.AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Unresolved</p>
              <p className="font-display text-3xl font-semibold text-slate-900 leading-none mt-1">
                {Number(summary.unresolved_errors || 0).toLocaleString()}
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icons.CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Resolved</p>
              <p className="font-display text-3xl font-semibold text-slate-900 leading-none mt-1">
                {Number(summary.resolved_errors || 0).toLocaleString()}
              </p>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Error Frequency</h2>
                <p className="text-xs text-slate-500">Errors over time</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-900"
                onClick={() =>
                  addErrorWidget({
                    title: "Error Frequency Over Time",
                    chartType: "line",
                    data: errorFrequency,
                    description: "Trend of frontend errors across the selected range",
                  })
                }
                title="Add to Dashboard"
              >
                <Icons.Add className="w-4 h-4" />
              </Button>
            </div>
            {loading ? <p className="text-sm text-slate-500 mt-auto mb-auto text-center">Loading...</p> : null}
            {!loading && errorFrequency.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 text-center border-2 border-dashed border-slate-100 rounded-xl">No error frequency data.</div>
            ) : !loading && errorFrequency.length > 0 ? (
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={errorFrequency} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={40} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="count" stroke="#ef4444" fill="#fecaca" strokeWidth={2.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </Card>

          <Card className="p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Top Errors</h2>
                <p className="text-xs text-slate-500">Most frequent issues</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-900"
                onClick={() =>
                  addErrorWidget({
                    title: "Top Errors",
                    chartType: "bar",
                    data: topErrors,
                    description: "Most frequent frontend errors",
                  })
                }
                title="Add to Dashboard"
              >
                <Icons.Add className="w-4 h-4" />
              </Button>
            </div>
            {loading ? <p className="text-sm text-slate-500 mt-auto mb-auto text-center">Loading...</p> : null}
            {!loading && topErrors.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 text-center border-2 border-dashed border-slate-100 rounded-xl">No errors captured.</div>
            ) : !loading && topErrors.length > 0 ? (
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topErrors.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(value) => value.length > 15 ? value.substring(0,15) + '...' : value} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '250px', whiteSpace: 'normal' }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </Card>

          <Card className="p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Errors by Page</h2>
                <p className="text-xs text-slate-500">Where errors happen</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-900"
                onClick={() =>
                  addErrorWidget({
                    title: "Errors by Page",
                    chartType: "bar",
                    data: errorsByPage,
                    description: "Pages that generate the most frontend errors",
                  })
                }
                title="Add to Dashboard"
              >
                <Icons.Add className="w-4 h-4" />
              </Button>
            </div>
            {!loading && errorsByPage.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 text-center border-2 border-dashed border-slate-100 rounded-xl">No page-level data.</div>
            ) : (
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={errorsByPage.slice(0, 8)} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={40} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(value) => value.length > 12 ? value.substring(0,12) + '...' : value} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white">
             <div className="flex flex-col">
                <h2 className="font-semibold text-slate-900">Error Events</h2>
                <p className="text-xs text-slate-500">{filteredEvents.length} events logged</p>
             </div>
             
             <div className="relative">
                <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  placeholder="Search errors, pages, users..." 
                  className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
             </div>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-left text-sm text-slate-600">
               <thead className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
                 <tr>
                    <th className="px-5 py-3 font-medium">Message</th>
                    <th className="px-5 py-3 font-medium">Page</th>
                    <th className="px-5 py-3 font-medium">Details</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 bg-white">
                 {paginatedEvents.length === 0 ? (
                   <tr>
                     <td colSpan="7" className="px-5 py-12 text-center text-slate-500">
                        {errorEvents.length === 0 ? "No error events available for this period." : "No events match your search criteria."}
                     </td>
                   </tr>
                 ) : (
                   paginatedEvents.map((event) => (
                     <tr key={event.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-5 py-3 font-medium text-slate-900 max-w-[300px] truncate" title={event.message}>{event.message}</td>
                        <td className="px-5 py-3"><Badge variant="default">{event.page}</Badge></td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          <div className="space-y-1">
                            <div>
                              <span className="font-medium text-slate-700">Type:</span> {event.error_type || "Error"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Source:</span>{" "}
                              {event.source
                                ? `${event.source}${event.line ? `:${event.line}` : ""}${event.column ? `:${event.column}` : ""}`
                                : "-"}
                            </div>
                            <div className="truncate max-w-[260px]" title={event.page_url || ""}>
                              <span className="font-medium text-slate-700">URL:</span> {event.page_url || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {event.resolved ? (
                            <Badge variant="default" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="default" className="border-orange-200 bg-orange-50 text-orange-700">
                              Open
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">{event.user_id ? <span className="text-slate-900 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{event.user_id}</span> : "-"}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">
                          {event.timestamp || event.created_at
                            ? new Date(event.timestamp || event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : "-"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {event.session_id ? (
                              <Link href={`/session-replays?sessionId=${encodeURIComponent(event.session_id)}&userId=${encodeURIComponent(event.user_id || "")}`}>
                                <Button variant="ghost" size="sm">
                                  Replay <Icons.Play className="w-3 h-3 ml-1" />
                                </Button>
                              </Link>
                            ) : null}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                copyDebugPayload(event).catch((err) => {
                                  setError(err.message || "Could not copy debug payload.");
                                });
                              }}
                            >
                              Copy
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={logsLoadingId === event.id}
                              onClick={() => {
                                setError("");
                                loadErrorLogs(event.id).catch((err) => {
                                  setError(err.message || "Could not load error logs.");
                                });
                              }}
                            >
                              {logsLoadingId === event.id ? "Loading" : "Logs"}
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={actionLoadingId === event.id}
                              onClick={() => {
                                setError("");
                                toggleResolve(event);
                              }}
                            >
                              {actionLoadingId === event.id
                                ? "Saving"
                                : event.resolved
                                ? "Reopen"
                                : "Resolve"}
                            </Button>
                          </div>
                        </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
          </div>
          
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between">
               <span className="text-xs text-slate-500">Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredEvents.length)} of {filteredEvents.length}</span>
               <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                  <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
               </div>
            </div>
          )}
        </Card>

        {logsModal.open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
            <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Error Logs</h3>
                  <p className="text-xs text-slate-500">Detailed stack trace and recent related occurrences.</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogsModal({ open: false, event: null, related_events: [] })}
                >
                  <Icons.X className="h-4 w-4" />
                </Button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{logsModal.event?.message || "(no message)"}</p>
                  <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <p><span className="font-semibold text-slate-700">Type:</span> {logsModal.event?.error_type || "Error"}</p>
                    <p><span className="font-semibold text-slate-700">Page:</span> {logsModal.event?.page || "-"}</p>
                    <p>
                      <span className="font-semibold text-slate-700">Source:</span>{" "}
                      {logsModal.event?.source
                        ? `${logsModal.event.source}${logsModal.event.line ? `:${logsModal.event.line}` : ""}${logsModal.event.column ? `:${logsModal.event.column}` : ""}`
                        : "-"}
                    </p>
                    <p><span className="font-semibold text-slate-700">Session:</span> {logsModal.event?.session_id || "-"}</p>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-500" title={logsModal.event?.page_url || ""}>
                    URL: {logsModal.event?.page_url || "-"}
                  </p>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Stack Trace</h4>
                  <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
{logsModal.event?.stack || "No stack trace captured for this error."}
                  </pre>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Recent Similar Errors</h4>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Seen</th>
                          <th className="px-3 py-2 font-medium">Page</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {logsModal.related_events.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-3 py-6 text-center text-slate-500">
                              No related events found.
                            </td>
                          </tr>
                        ) : (
                          logsModal.related_events.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">
                                {item.seen_at ? new Date(item.seen_at).toLocaleString() : "-"}
                              </td>
                              <td className="px-3 py-2">{item.page || "-"}</td>
                              <td className="px-3 py-2">
                                {item.source
                                  ? `${item.source}${item.line ? `:${item.line}` : ""}${item.column ? `:${item.column}` : ""}`
                                  : "-"}
                              </td>
                              <td className="px-3 py-2">{item.resolved ? "Resolved" : "Open"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
