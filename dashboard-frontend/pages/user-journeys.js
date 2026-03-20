import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAnalytics } from "@/utils/backendClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

export default function UserJourneysPage() {
  const { searchText } = useWorkspace();
  const [journeys, setJourneys] = useState({ top_paths: [], transitions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const topTransitionsChartData = useMemo(() => {
    return (journeys.transitions || []).slice(0, 10).map((row) => ({
      label: `${row.source} -> ${row.target}`,
      count: Number(row.count || 0),
    }));
  }, [journeys.transitions]);

  const sequencePreview = useMemo(() => {
    const first = (journeys.transitions || []).slice(0, 4).map((row) => row.source);
    const last = (journeys.transitions || []).slice(0, 4).map((row) => row.target);
    const sequence = [...first, ...last].filter(Boolean).slice(0, 6);
    return sequence.filter((item, index) => sequence.indexOf(item) === index);
  }, [journeys.transitions]);

  const filteredTransitions = useMemo(() => {
    if (!searchText.trim()) return topTransitionsChartData;
    const needle = searchText.toLowerCase();
    return topTransitionsChartData.filter((item) => item.label.toLowerCase().includes(needle));
  }, [searchText, topTransitionsChartData]);

  useEffect(() => {
    async function loadJourneys() {
      try {
        setLoading(true);
        setError("");
        const payload = await fetchAnalytics("/user-journeys?limit=20");
        setJourneys({
          top_paths: Array.isArray(payload?.top_paths) ? payload.top_paths : [],
          transitions: Array.isArray(payload?.transitions) ? payload.transitions : [],
        });
      } catch (err) {
        setError(err.message || "Unable to load user journeys.");
      } finally {
        setLoading(false);
      }
    }

    loadJourneys();
  }, []);

  return (
    <div className="space-y-6 pb-6">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">User Journeys</h1>
        <p className="mt-1 text-sm text-slate-500">Visualize common user sequences and high-volume transition pathways.</p>
      </section>

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="flex flex-col p-0 overflow-hidden min-h-[440px]">
            <div className="p-5 border-b border-slate-100 bg-white">
              <h2 className="font-semibold text-slate-900">Top Transition Flow</h2>
              <p className="text-sm text-slate-500 mt-1">Highest frequency page-to-page movements</p>
            </div>
            
            <div className="flex-1 p-5 bg-slate-50/50 flex flex-col relative min-h-[300px]">
              {loading && (
                <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}
              
              {!loading && filteredTransitions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Icons.Filter className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">No transition data available</p>
                </div>
              ) : (
                <div className="flex-1 w-full h-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredTransitions} layout="vertical" margin={{ top: 8, right: 30, left: 20, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="label" width={200} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <Card className="flex flex-col p-0 overflow-hidden h-fit">
            <div className="p-5 border-b border-slate-100 bg-white">
              <h2 className="font-semibold text-slate-900">Most Common Sequence</h2>
              <p className="text-sm text-slate-500 mt-1">Typical path users take through the app</p>
            </div>
            
            <div className="p-6 bg-slate-50/50 h-full">
              {sequencePreview.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <Icons.Activity className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">No sequence generated yet</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    {sequencePreview.map((event, index) => (
                      <div key={`${event}-${index}`} className="flex items-center gap-3">
                        <div className="bg-white border border-slate-200 shadow-sm rounded-lg px-3 py-2 text-sm font-medium text-slate-700 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-[10px] flex items-center justify-center text-slate-500 font-bold shrink-0">{index + 1}</span>
                          {event}
                        </div>
                        {index < sequencePreview.length - 1 ? (
                          <Icons.ArrowRight className="w-4 h-4 text-slate-300" />
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700 flex gap-3 items-start">
                    <Icons.Info className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>This sequence is generated from the highest transition-volume path edges in the selected period. Use it as a starting point to build a formal Funnel.</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Path Explorer</h2>
              <p className="mt-1 text-sm text-slate-500">High-volume destination pages and repeat entry points.</p>
            </div>
            <Button variant="secondary" size="sm">
              <Icons.Download className="w-4 h-4 mr-1.5" /> Export Data
            </Button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-medium">Page Path</th>
                  <th className="px-6 py-4 font-medium text-right">Total Views</th>
                  <th className="px-6 py-4 font-medium text-right">Unique Users</th>
                  <th className="px-6 py-4 font-medium text-right">Avg. Views/User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(journeys.top_paths || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      No path data available for this timeframe
                    </td>
                  </tr>
                ) : (
                  (journeys.top_paths || []).map((item, idx) => {
                    const avgViews = item.users > 0 ? (item.views / item.users).toFixed(1) : 0;
                    return (
                      <tr key={`${item.page}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{item.page}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(item.views || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-900">{Number(item.users || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <Badge variant="default" className="bg-slate-100 text-slate-600 font-mono">{avgViews}x</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
