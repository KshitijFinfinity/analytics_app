import React, { useEffect, useMemo, useState } from "react";
import IframeHeatmapOverlay from "@/components/IframeHeatmapOverlay";
import HeatmapStats from "@/components/HeatmapStats";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

const CONFIGURED_BACKEND_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE;
const FALLBACK_BACKEND_BASES = [4001, 4002, 4003, 4004, 4005, 4006, 4000].map(
  (port) => `http://localhost:${port}`
);
const BACKEND_BASES = [CONFIGURED_BACKEND_BASE, ...FALLBACK_BACKEND_BASES].filter(
  (base, index, values) => Boolean(base) && values.indexOf(base) === index
);

let resolvedBackendBase = null;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchFromBackend(path, options = {}) {
  const timeout = 10000;
  const candidateBases = [resolvedBackendBase, ...BACKEND_BASES].filter(
    (base, index, values) => Boolean(base) && values.indexOf(base) === index
  );

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const base of candidateBases) {
      let timeoutId;

      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${base}/analytics${path}`, {
          ...options,
          signal: controller.signal,
        });

        if (response.ok) {
          resolvedBackendBase = base;
          return await response.json();
        }

        lastError = new Error(`Server ${base} returned status ${response.status}`);
        console.warn(lastError.message);
      } catch (error) {
        lastError = error;
        console.warn(`Failed to fetch from ${base}:`, error.message);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (attempt < 2) {
      await sleep(750);
    }
  }

  throw lastError || new Error("Could not reach any backend server");
}

export default function HeatmapsPage() {
  const defaultStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  }, []);

  const [filters, setFilters] = useState({
    selectedPage: "",   
    startDate: defaultStartDate,
    endDate: new Date().toISOString().split("T")[0],
    deviceType: "all",
    mode: "hover",
    bucketSize: "0.05",
  });

  const [pages, setPages] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const response = await fetchFromBackend(
          `/heatmap/pages?start_date=${filters.startDate}T00:00:00Z&end_date=${filters.endDate}T23:59:59Z`
        );

        if (response.success && Array.isArray(response.data)) {
          setPages(response.data);
          if (!filters.selectedPage && response.data.length > 0) {
            setFilters((prev) => ({ ...prev, selectedPage: response.data[0] }));
          }
        } else {
          setPages([]);
        }
      } catch (err) {
        console.error("Error fetching pages", err);
        setPages([]);
        setError(
          "Could not fetch available pages. Make sure the backend is running or set NEXT_PUBLIC_ANALYTICS_BASE."
        );
      }
    };

    fetchPages();
  }, [filters.endDate, filters.startDate]);

  useEffect(() => {
    if (!filters.selectedPage) {
      setHeatmapData([]);
      setSnapshot(null);
      setStats({});
      return;
    }

    const fetchHeatmapData = async () => {
      setLoading(true);
      setError(null);

      try {
        const { selectedPage, startDate, endDate, deviceType, mode, bucketSize } = filters;
        let queryParams = `?page_url=${encodeURIComponent(
          selectedPage
        )}&start_date=${startDate}T00:00:00Z&end_date=${endDate}T23:59:59Z&bucket_size=${encodeURIComponent(bucketSize)}`;

        if (deviceType !== "all") {
          queryParams += `&device_type=${encodeURIComponent(deviceType)}`;
        }

        const [dataResponse, snapshotResponse, statsResponse] = await Promise.all([
          fetchFromBackend(`/heatmap/${mode}${queryParams}`),
          fetchFromBackend(`/heatmap/snapshot${queryParams}`),
          fetchFromBackend(
            `/heatmap/stats?page_url=${encodeURIComponent(
              selectedPage
            )}&start_date=${startDate}T00:00:00Z&end_date=${endDate}T23:59:59Z`
          ),
        ]);

        setHeatmapData(dataResponse.success ? dataResponse.data || [] : []);
        setSnapshot(snapshotResponse.success ? snapshotResponse.data || null : null);
        setStats(statsResponse.success ? statsResponse.data || {} : {});
      } catch (err) {
        console.error("Error fetching heatmap data:", err);
        setError("Failed to load heatmap data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchHeatmapData();
  }, [filters]);

  return (
    <div className="space-y-6 pb-6">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Heatmap Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">Visualize user clicks and hovers across tracked web pages.</p>
      </section>

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 space-y-6">
        <Card className="p-4 shadow-sm relative z-20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-700">Page:</span>
                <select
                  value={filters.selectedPage}
                  onChange={(e) => setFilters((prev) => ({ ...prev, selectedPage: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-48 bg-slate-50 hover:bg-white transition-colors"
                >
                  <option value="">Select a page...</option>
                  {pages.map((page) => (
                    <option key={page} value={page}>{page}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-700">Mode:</span>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setFilters(prev => ({...prev, mode: "hover"}))} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${filters.mode === "hover" ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Hover</button>
                  <button onClick={() => setFilters(prev => ({...prev, mode: "click"}))} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${filters.mode === "click" ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Click</button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)} className={showFilters ? "bg-slate-200" : ""}>
                <Icons.Filter className="w-4 h-4 mr-1.5" /> Filters
                {showFilters ? <Icons.ChevronUp className="w-4 h-4 ml-1" /> : <Icons.ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Device</label>
                <select
                  value={filters.deviceType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, deviceType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white"
                >
                  <option value="all">All Devices</option>
                  <option value="desktop">Desktop</option>
                  <option value="tablet">Tablet</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Grid Resolution</label>
                <select
                  value={filters.bucketSize}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bucketSize: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white"
                >
                  <option value="0.08">Low (Fast)</option>
                  <option value="0.05">Medium</option>
                  <option value="0.04">High (Detailed)</option>
                </select>
              </div>
              
              <div className="md:col-span-2 lg:col-span-4 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => {
                      setFilters({
                        selectedPage: pages[0] || "",
                        startDate: defaultStartDate,
                        endDate: new Date().toISOString().split("T")[0],
                        deviceType: "all",
                        mode: "hover",
                        bucketSize: "0.05",
                      });
                    }}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    Reset Filters
                  </Button>
              </div>
            </div>
          )}
        </Card>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
            <Icons.Info className="w-5 h-5 text-red-500" />
            <span>{error}</span>
          </div>
        ) : null}

      <HeatmapStats stats={stats} loading={loading} />

      {filters.selectedPage ? (
        <Card className="p-0 overflow-hidden relative border border-slate-200 shadow-sm z-10 w-full min-h-[600px] flex">
           <div className="w-full flex-1">
            <IframeHeatmapOverlay
              pageUrl={filters.selectedPage}
              cells={heatmapData}
              snapshot={snapshot}
              loading={loading}
              bucketSize={Number(filters.bucketSize)}
              mode={filters.mode}
            />
          </div>
        </Card>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-20 text-center flex flex-col items-center">
          <Icons.Activity className="w-10 h-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Select a page to visualize</h2>
          <p className="max-w-md text-sm text-slate-500">
            Once selected, the dashboard will render the latest stored DOM snapshot and overlay aggregate activity directly on top.
          </p>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-white">
          <h3 className="text-sm font-semibold text-slate-900">Data Snapshot</h3>
          <p className="mt-1 text-xs text-slate-500">
            Aggregated {filters.mode} data mapped to global DOM coordinates.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-medium">X Coord (%)</th>
                <th className="px-6 py-3 font-medium">Y Coord (%)</th>
                <th className="px-6 py-3 font-medium">{filters.mode === "hover" ? "Hovers" : "Clicks"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {heatmapData.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                    No {filters.mode} activity mapped for current filters.
                  </td>
                </tr>
              ) : (
                heatmapData.slice(0, 20).map((row, idx) => (
                  <tr key={`${row.x_percent}-${row.y_percent}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-slate-700">{Math.round(Number(row.x_percent || 0) * 100)}%</td>
                    <td className="px-6 py-3 font-mono text-slate-700">{Math.round(Number(row.y_percent || 0) * 100)}%</td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      <Badge variant="default" className="bg-slate-100 text-slate-600">
                        {filters.mode === "hover" ? row.hover_count : row.click_count}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}