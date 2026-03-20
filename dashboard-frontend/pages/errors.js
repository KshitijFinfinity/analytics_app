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
  const [summary, setSummary] = useState({ top_errors: [], frequency: [], replay_sessions: [], sessions_affected: 0, total_errors: 0 });
  const [eventsPayload, setEventsPayload] = useState({ by_page: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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

  const replaySessions = useMemo(() => summary.replay_sessions || [], [summary.replay_sessions]);
  const errorEvents = useMemo(() => eventsPayload.events || [], [eventsPayload.events]);

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

  useEffect(() => {
    async function loadErrorSummary() {
      try {
        setLoading(true);
        setError("");

        const [summaryPayload, eventsData] = await Promise.all([
          fetchAnalytics("/frontend-errors/summary").catch(() => ({
            top_errors: [],
            frequency: [],
            replay_sessions: [],
            sessions_affected: 0,
            total_errors: 0,
          })),
          fetchAnalytics(`/frontend-errors/events?${toQuery({ limit: 120 })}`).catch(() => ({ by_page: [], events: [] })),
        ]);

        setSummary(summaryPayload || { top_errors: [], frequency: [], replay_sessions: [], sessions_affected: 0, total_errors: 0 });
        setEventsPayload(eventsData || { by_page: [], events: [] });
      } catch (err) {
        setError(err.message || "Unable to load errors summary.");
      } finally {
        setLoading(false);
      }
    }

    loadErrorSummary();
  }, [resolvedRange.endDate, resolvedRange.startDate]);

  const filteredEvents = useMemo(() => {
    return errorEvents.filter(event => 
      (event.message || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.page || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.user_id || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [errorEvents, searchTerm]);

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

        <div className="grid gap-6 md:grid-cols-2">
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
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 bg-white">
                 {paginatedEvents.length === 0 ? (
                   <tr>
                     <td colSpan="5" className="px-5 py-12 text-center text-slate-500">
                        {errorEvents.length === 0 ? "No error events available for this period." : "No events match your search criteria."}
                     </td>
                   </tr>
                 ) : (
                   paginatedEvents.map((event) => (
                     <tr key={event.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-5 py-3 font-medium text-slate-900 max-w-[300px] truncate" title={event.message}>{event.message}</td>
                        <td className="px-5 py-3"><Badge variant="default">{event.page}</Badge></td>
                        <td className="px-5 py-3 text-slate-500">{event.user_id ? <span className="text-slate-900 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{event.user_id}</span> : "-"}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">
                          {event.timestamp || event.created_at
                            ? new Date(event.timestamp || event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : "-"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {event.session_id ? (
                            <Link href={`/session-replays?sessionId=${encodeURIComponent(event.session_id)}&userId=${encodeURIComponent(event.user_id || "")}`}>
                              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                Replay <Icons.Play className="w-3 h-3 ml-1" />
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-300 mr-2">N/A</span>
                          )}
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
      </section>
    </div>
  );
}
