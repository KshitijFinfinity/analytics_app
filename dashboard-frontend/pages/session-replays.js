import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import "rrweb-player/dist/style.css";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";

const ANALYTICS_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE || "http://localhost:4001";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatLocalDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(durationMs) {
  const safe = Number(durationMs || 0);
  if (safe <= 0) return "0s";
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatRelativeSessionTime(ts, baseTs) {
  const at = new Date(ts).getTime();
  const base = new Date(baseTs).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(base) || at < base) return "-";
  return formatDuration(at - base);
}

function formatEndReason(value) {
  if (!value) return "-";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSessionLocation(session) {
  const city = String(session?.city || "").trim();
  const region = String(session?.region || "").trim();
  const country = String(session?.country || "").trim();

  const parts = [city, region, country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");

  const timezone = String(session?.timezone || "").trim();
  return timezone || "Unknown location";
}

const MARKER_COLORS = {
  dead_click: "#ef4444",
  console_error: "#f97316",
  rage_click: "#a855f7",
  navigation: "#3b82f6",
  network_error: "#eab308",
};

const MARKER_LABELS = {
  dead_click: "Dead Click",
  console_error: "Console Error",
  rage_click: "Rage Click",
  navigation: "Navigation",
  network_error: "Network Error",
};

function toMs(value) {
  const asDate = new Date(value).getTime();
  return Number.isFinite(asDate) ? asDate : 0;
}

function classifyErrorType(message) {
  const text = String(message || "").toLowerCase();
  if (/(network|failed to fetch|xhr|status\s*[45]\d\d|timeout|cors)/i.test(text)) {
    return "network_error";
  }
  return "console_error";
}

function extractNavigationEvents(replayEvents) {
  return (Array.isArray(replayEvents) ? replayEvents : [])
    .filter((event) => Number(event?.type) === 5 && String(event?.data?.tag || "") === "navigation")
    .map((event) => ({
      timestamp: Number(event?.timestamp || 0),
      detail: event?.data?.payload?.path || event?.data?.payload?.url || event?.data?.payload?.to || "navigation",
    }))
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp > 0);
}

function buildUnifiedMarkers({ deadClicks, sessionErrors, replayEvents, sessionBaseMs, sessionDurationMs }) {
  if (!sessionBaseMs || !sessionDurationMs) return [];

  const raw = [];

  (Array.isArray(deadClicks) ? deadClicks : []).forEach((item) => {
    const offsetMs = toMs(item.timestamp) - sessionBaseMs;
    if (offsetMs < 0 || offsetMs > sessionDurationMs) return;
    raw.push({
      type: "dead_click",
      offsetMs,
      detail: item.element || item.page || "dead click",
      meta: item,
    });
  });

  (Array.isArray(sessionErrors) ? sessionErrors : []).forEach((item) => {
    const offsetMs = toMs(item.timestamp) - sessionBaseMs;
    if (offsetMs < 0 || offsetMs > sessionDurationMs) return;
    raw.push({
      type: classifyErrorType(item.message),
      offsetMs,
      detail: item.message || "frontend error",
      meta: item,
    });
  });

  extractNavigationEvents(replayEvents).forEach((item) => {
    const offsetMs = item.timestamp - sessionBaseMs;
    if (offsetMs < 0 || offsetMs > sessionDurationMs) return;
    raw.push({
      type: "navigation",
      offsetMs,
      detail: item.detail,
      meta: item,
    });
  });

  // Derive rage-click events from tight dead-click bursts.
  const sortedDead = raw.filter((item) => item.type === "dead_click").sort((a, b) => a.offsetMs - b.offsetMs);
  for (let i = 0; i < sortedDead.length; i += 1) {
    let j = i;
    while (j < sortedDead.length && sortedDead[j].offsetMs - sortedDead[i].offsetMs <= 1000) {
      j += 1;
    }
    const count = j - i;
    if (count >= 3) {
      const clusterItems = sortedDead.slice(i, j);
      const avgOffset = Math.round(clusterItems.reduce((sum, item) => sum + item.offsetMs, 0) / count);
      raw.push({
        type: "rage_click",
        offsetMs: avgOffset,
        detail: `${count} rapid dead clicks`,
        meta: { count },
      });
      i = j - 1;
    }
  }

  const sorted = raw.sort((a, b) => a.offsetMs - b.offsetMs);

  // Cluster events that happen close together (<= 1 second apart).
  const clusters = [];
  for (const marker of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || marker.offsetMs - last.endOffsetMs > 1000) {
      clusters.push({
        startOffsetMs: marker.offsetMs,
        endOffsetMs: marker.offsetMs,
        markers: [marker],
      });
    } else {
      last.endOffsetMs = marker.offsetMs;
      last.markers.push(marker);
    }
  }

  // Lane assignment to avoid overlap.
  const laneLastOffset = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  return clusters.map((cluster, index) => {
    const offsetMs = Math.round(
      cluster.markers.reduce((sum, marker) => sum + marker.offsetMs, 0) / cluster.markers.length
    );
    const percent = Math.min(99.6, Math.max(0.4, (offsetMs / sessionDurationMs) * 100));

    let lane = 0;
    while (lane < laneLastOffset.length && offsetMs - laneLastOffset[lane] < 1400) {
      lane += 1;
    }
    if (lane >= laneLastOffset.length) lane = index % laneLastOffset.length;
    laneLastOffset[lane] = offsetMs;

    const typeCounts = cluster.markers.reduce((acc, marker) => {
      acc[marker.type] = (acc[marker.type] || 0) + 1;
      return acc;
    }, {});

    const primaryType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "dead_click";

    return {
      id: `cluster-${index}-${offsetMs}`,
      lane,
      percent,
      offsetMs,
      primaryType,
      count: cluster.markers.length,
      markers: cluster.markers,
      typeCounts,
      detail:
        cluster.markers.length === 1
          ? cluster.markers[0].detail
          : `${cluster.markers.length} events (${Object.entries(typeCounts)
              .map(([type, count]) => `${MARKER_LABELS[type]}: ${count}`)
              .join(", ")})`,
    };
  });
}

export default function SessionReplaysPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [sessionFilters, setSessionFilters] = useState({
    date: "",
    user: "",
    errorsOnly: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const [selectedSession, setSelectedSession] = useState(null);
  const [replayEvents, setReplayEvents] = useState([]);
  const [sessionErrors, setSessionErrors] = useState([]);
  const [deadClicks, setDeadClicks] = useState([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState("");
  const [replayCurrentTime, setReplayCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoveredClusterId, setHoveredClusterId] = useState("");

  const playerContainerRef = useRef(null);
  const playerInstanceRef = useRef(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadSessions({ silent: true });
    };

    const intervalId = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const sessionId = String(router.query.sessionId || "");
    if (!sessionId || sessions.length === 0 || selectedSession) return;

    const userId = String(router.query.userId || "");
    const match = sessions.find((item) => {
      if (String(item.session_id) !== sessionId) return false;
      if (!userId) return true;
      return String(item.user_id || "") === userId;
    });

    if (match) {
      void openReplay(match);
    }
  }, [router.query.sessionId, router.query.userId, sessions, selectedSession]);

  useEffect(() => {
    if (!selectedSession || replayEvents.length === 0 || !playerContainerRef.current) return;

    const hasFullSnapshot = replayEvents.some((event) => Number(event?.type) === 2);
    if (!hasFullSnapshot) {
      setReplayError("This session is missing an initial full snapshot and cannot be replayed. Record a fresh session and try again.");
      return;
    }

    let cancelled = false;
    const container = playerContainerRef.current;

    import("rrweb-player")
      .then(({ default: RRWebPlayer }) => {
        if (cancelled || !container) return;

        try {
          container.innerHTML = "";
          const player = new RRWebPlayer({
            target: container,
            props: {
              events: replayEvents,
              width: Math.max(320, (container.clientWidth || 0) - 8),
              height: 500,
              autoPlay: false,
              skipInactive: true,
              showController: false,
            },
          });
          playerInstanceRef.current = player;
          setIsPlaying(false);
          setReplayCurrentTime(0);
          setPlaybackSpeed(1);

          // Use player-emitted events instead of polling for reliability.
          player.addEventListener("ui-update-current-time", ({ payload }) => {
            if (!cancelled) setReplayCurrentTime(Number(payload) || 0);
          });
          player.addEventListener("ui-update-player-state", ({ payload }) => {
            if (!cancelled) setIsPlaying(payload === "playing");
          });
        } catch {
          setReplayError("Replay player failed to initialize for this session.");
        }
      })
      .catch(() => {
        setReplayError("Unable to load rrweb-player.");
      });

    return () => {
      cancelled = true;
      playerInstanceRef.current = null;
      if (container) container.innerHTML = "";
      setIsPlaying(false);
    };
  }, [selectedSession, replayEvents]);

  const hasSessions = useMemo(() => sessions.length > 0, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((item) => {
      const userMatch = !sessionFilters.user || String(item.user_id || "").toLowerCase().includes(sessionFilters.user.toLowerCase());
      const errorsMatch = !sessionFilters.errorsOnly || Number(item.error_count || 0) > 0;

      let dateMatch = true;
      if (sessionFilters.date) {
        const start = item.start_timestamp ? new Date(item.start_timestamp) : null;
        if (!start || Number.isNaN(start.getTime())) {
          dateMatch = false;
        } else {
          const day = formatLocalDateInput(start);
          dateMatch = day === sessionFilters.date;
        }
      }

      return userMatch && errorsMatch && dateMatch;
      })
      .sort((a, b) => {
        const aTime = new Date(a.end_timestamp || a.start_timestamp || 0).getTime() || 0;
        const bTime = new Date(b.end_timestamp || b.start_timestamp || 0).getTime() || 0;
        return bTime - aTime;
      });
  }, [sessions, sessionFilters]);

  const hasFilteredSessions = useMemo(() => filteredSessions.length > 0, [filteredSessions]);

  const sessionBaseMs = useMemo(() => {
    if (replayEvents.length === 0) return 0;
    return Number(replayEvents[0]?.timestamp || 0);
  }, [replayEvents]);

  const sessionDurationMs = useMemo(() => {
    if (replayEvents.length < 2) return 0;
    const first = Number(replayEvents[0]?.timestamp || 0);
    const last = Number(replayEvents[replayEvents.length - 1]?.timestamp || 0);
    return Math.max(0, last - first);
  }, [replayEvents]);

  const activeDeadClick = useMemo(() => {
    if (!sessionBaseMs || deadClicks.length === 0) return null;
    return (
      deadClicks.find((dc) => {
        const offset = new Date(dc.timestamp).getTime() - sessionBaseMs;
        return Math.abs(offset - replayCurrentTime) <= 1500;
      }) || null
    );
  }, [replayCurrentTime, deadClicks, sessionBaseMs]);

  const timelineClusters = useMemo(
    () =>
      buildUnifiedMarkers({
        deadClicks,
        sessionErrors,
        replayEvents,
        sessionBaseMs,
        sessionDurationMs,
      }),
    [deadClicks, replayEvents, sessionBaseMs, sessionDurationMs, sessionErrors]
  );

  const hoveredCluster = useMemo(
    () => timelineClusters.find((cluster) => cluster.id === hoveredClusterId) || null,
    [hoveredClusterId, timelineClusters]
  );

  const playbackPercent = useMemo(() => {
    if (!sessionDurationMs) return 0;
    return Math.min(100, Math.max(0, (replayCurrentTime / sessionDurationMs) * 100));
  }, [replayCurrentTime, sessionDurationMs]);

  const markerSummary = useMemo(() => {
    const summary = {
      dead_click: 0,
      console_error: 0,
      rage_click: 0,
      navigation: 0,
      network_error: 0,
    };

    timelineClusters.forEach((cluster) => {
      Object.entries(cluster.typeCounts || {}).forEach(([type, count]) => {
        summary[type] = (summary[type] || 0) + Number(count || 0);
      });
    });

    return summary;
  }, [timelineClusters]);

  async function loadSessions(options = {}) {
    const { silent = false } = options;

    try {
      if (!silent) {
        setLoading(true);
        setError("");
        setMessage("");
      }

      const response = await fetch(`${ANALYTICS_BASE}/analytics/session-recordings?limit=250`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load sessions (${response.status})`);
      const rows = await response.json();
      setSessions(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (!silent) {
        setError(err.message || "Unable to load session replays.");
        setSessions([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function deleteAllReplays() {
    if (deleting) return;
    const confirmed = window.confirm("Delete all stored replays and frontend errors?");
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      setMessage("");

      const response = await fetch(`${ANALYTICS_BASE}/analytics/session-recordings`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(`Failed to delete replays (${response.status})`);

      const payload = await response.json();
      const deletedSessions = Number(payload?.deleted_session_recordings || 0);
      const deletedErrors = Number(payload?.deleted_frontend_errors || 0);

      setSessions([]);
      setMessage(`Deleted ${deletedSessions} replay batch records and ${deletedErrors} frontend errors.`);

      if (selectedSession) {
        closeReplay();
      }
    } catch (err) {
      setError(err.message || "Unable to delete replays.");
    } finally {
      setDeleting(false);
    }
  }

  async function openReplay(session) {
    setSelectedSession(session);
    setReplayLoading(true);
    setReplayError("");
    setReplayEvents([]);
    setSessionErrors([]);
    setDeadClicks([]);
    setReplayCurrentTime(0);

    try {
      const [eventsResponse, deadClicksResponse] = await Promise.all([
        fetch(
          `${ANALYTICS_BASE}/analytics/session-recordings/${encodeURIComponent(session.session_id)}/events?user_id=${encodeURIComponent(session.user_id)}`
        ),
        fetch(
          `${ANALYTICS_BASE}/analytics/session-recordings/${encodeURIComponent(session.session_id)}/dead-clicks?user_id=${encodeURIComponent(session.user_id)}`
        ),
      ]);

      if (!eventsResponse.ok) throw new Error(`Failed to load replay (${eventsResponse.status})`);

      const payload = await eventsResponse.json();
      const events = Array.isArray(payload?.events) ? payload.events : [];
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      const dcPayload = deadClicksResponse.ok ? await deadClicksResponse.json() : [];

      setReplayEvents(events);
      setSessionErrors(errors);
      setDeadClicks(Array.isArray(dcPayload) ? dcPayload : []);

      if (events.length === 0) {
        setReplayError("No replay events available for this session.");
      }
    } catch (err) {
      setReplayError(err.message || "Unable to load replay data.");
    } finally {
      setReplayLoading(false);
    }
  }

  async function deleteReplay(session) {
    const confirmed = window.confirm(`Delete replay for session ${session.session_id}?`);
    if (!confirmed) return;

    try {
      setError("");
      setMessage("");

      const response = await fetch(
        `${ANALYTICS_BASE}/analytics/session-recordings/${encodeURIComponent(session.session_id)}?user_id=${encodeURIComponent(session.user_id)}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error(`Failed to delete replay (${response.status})`);

      const payload = await response.json();
      const deletedSessions = Number(payload?.deleted_session_recordings || 0);
      const deletedErrors = Number(payload?.deleted_frontend_errors || 0);

      setSessions((prev) =>
        prev.filter((item) => !(item.session_id === session.session_id && item.user_id === session.user_id))
      );
      setMessage(`Deleted 1 replay row (${deletedSessions} batches, ${deletedErrors} errors removed).`);

      if (selectedSession && selectedSession.session_id === session.session_id && selectedSession.user_id === session.user_id) {
        closeReplay();
      }
    } catch (err) {
      setError(err.message || "Unable to delete replay.");
    }
  }

  function closeReplay() {
    setSelectedSession(null);
    setReplayEvents([]);
    setSessionErrors([]);
    setDeadClicks([]);
    setReplayCurrentTime(0);
    setReplayError("");
    setHoveredClusterId("");
    setIsPlaying(false);
    setPlaybackSpeed(1);
  }

  function jumpToTime(offsetMs) {
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      if (typeof player.goto === "function") {
        player.goto(offsetMs);
        return;
      }
      const replayer = typeof player.getReplayer === "function" ? player.getReplayer() : null;
      if (replayer && typeof replayer.pause === "function") replayer.pause(offsetMs);
    } catch {
      // player may not expose goto in all versions
    }
  }

  function togglePlayback() {
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      player.toggle();
    } catch {
      // noop
    }
  }

  function handleSpeedChange(speed) {
    setPlaybackSpeed(speed);
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      player.setSpeed(speed);
    } catch {
      // noop
    }
  }

  function handleTimelineClick(e) {
    if (!sessionDurationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    jumpToTime(Math.round(ratio * sessionDurationMs));
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900 tracking-tight">Session Replays</h1>
            <p className="mt-1 text-sm text-slate-500">Replay user sessions and diagnose frontend errors.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={deleteAllReplays} disabled={deleting} className={deleting ? "opacity-50" : "hover:text-red-600 border-red-100"}>
              <Icons.Trash className="w-4 h-4 mr-2" />
              {deleting ? "Deleting..." : "Clear All"}
            </Button>
            <Link href="/">
              <Button variant="secondary">Dashboard</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <Card className="p-0 overflow-hidden mb-6">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-4">
            <h2 className="font-semibold text-slate-900 hidden sm:block mr-2">Filters</h2>
            <input
              type="date"
              value={sessionFilters.date}
              onChange={(e) => setSessionFilters((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="relative">
              <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={sessionFilters.user}
                onChange={(e) => setSessionFilters((prev) => ({ ...prev, user: e.target.value }))}
                placeholder="Search User ID..."
                className="pl-9 pr-4 rounded-lg border border-slate-200 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none ml-auto">
              <input
                type="checkbox"
                checked={sessionFilters.errorsOnly}
                onChange={(e) => setSessionFilters((prev) => ({ ...prev, errorsOnly: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              Errors Only
            </label>
            <Button variant="secondary" size="icon" onClick={loadSessions} title="Refresh">
              <Icons.Expand className="w-4 h-4 rotate-45" /> {/* Use as a refresh placeholder if needed */}
            </Button>
          </div>

          <div className="p-6">
            {loading ? <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div> : null}
            {error ? <p className="text-sm text-red-600 mb-4">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-600 mb-4">{message}</p> : null}

            {!loading && !hasSessions ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icons.Play className="w-6 h-6 text-slate-300 ml-1" />
                </div>
                <h3 className="font-medium text-slate-900">No session recordings</h3>
                <p className="text-sm text-slate-500 mt-1">Sessions will appear here once they are captured.</p>
              </div>
            ) : null}

            {!loading && hasSessions && !hasFilteredSessions ? (
              <div className="py-12 text-center text-slate-500">No sessions match your filters.</div>
            ) : null}

            {!loading && hasFilteredSessions ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredSessions.map((session) => (
                  <div key={`${session.user_id}-${session.session_id}`} className="group relative border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all bg-white cursor-pointer" onClick={() => openReplay(session)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                          {String(session.user_id || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="font-medium text-slate-900 text-sm truncate">{session.user_id}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{formatDateTime(session.start_timestamp)}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-7 w-7 text-slate-400 hover:text-red-600 transition-opacity" onClick={(e) => { e.stopPropagation(); deleteReplay(session); }}>
                        <Icons.Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
                       <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                         <span className="font-semibold text-slate-800">{formatDuration(session.duration_ms)}</span>
                       </span>
                       {Number(session.error_count) > 0 && (
                         <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-100 font-medium whitespace-nowrap">
                           {session.error_count} Errors
                         </span>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      {/* Session Replay Modal overlay */}
      {selectedSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[1200px] h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 font-bold border border-blue-100">
                     {String(selectedSession.user_id || "U").slice(0, 1).toUpperCase()}
                   </div>
                   <div>
                     <h3 className="font-semibold text-slate-900 leading-tight">{selectedSession.user_id}</h3>
                     <p className="text-xs text-slate-500">{formatSessionLocation(selectedSession)} • {formatDateTime(selectedSession.start_timestamp)}</p>
                   </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                 <div className="hidden sm:flex items-center gap-3 text-xs font-medium mr-4">
                    {deadClicks.length > 0 && <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> {deadClicks.length} Dead Clicks</span>}
                    {sessionErrors.length > 0 && <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> {sessionErrors.length} Errors</span>}
                 </div>
                 <Button variant="ghost" size="icon" onClick={closeReplay} className="text-slate-400 hover:text-slate-900 hover:bg-slate-100">
                   {/* Close Icon Using Edit as placeholder if none exists, or just use text 'Esc' */}
                   <span className="text-xs font-bold font-mono">ESC</span>
                 </Button>
              </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
              {replayLoading ? (
                <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
              ) : replayError ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center text-red-600">{replayError}</div>
              ) : (
                <>
                  {/* Video Player */}
                  <div className="relative w-full bg-white flex-1 min-h-[400px] flex flex-col justify-center items-center py-4">
                    {activeDeadClick ? (
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium animate-fade-in flex items-center gap-2">
                         <Icons.Expand className="w-4 h-4" /> {/* Click indicator */}
                         Dead Click &rarr; {activeDeadClick.element}
                      </div>
                    ) : null}
                    
                    {/* The actual rrweb player container */}
                    <div ref={playerContainerRef} className="max-w-full shadow-sm border border-slate-100 rounded-lg overflow-hidden bg-white" style={{boxShadow: '0 4px 40px rgba(0,0,0,0.04)'}} />
                  </div>

                  {/* Player Controls */}
                  {sessionDurationMs > 0 && (
                    <div className="bg-white border-t border-slate-200 px-6 py-4 sticky bottom-0 z-20">
                      
                      {/* Timeline Slider */}
                      <div className="relative h-6 group cursor-pointer flex items-center" onClick={handleTimelineClick} onMouseLeave={() => setHoveredClusterId("")}>
                         <div className="absolute inset-x-0 h-1.5 bg-slate-100 rounded-full overflow-hidden transition-all group-hover:h-2">
                           <div className="absolute left-0 top-0 bottom-0 bg-blue-500 rounded-full" style={{ width: `${playbackPercent}%` }} />
                         </div>
                         
                         {/* Event Markers Overlaid */}
                         {timelineClusters.map(cluster => (
                           <div
                             key={cluster.id}
                             className={`absolute w-3 h-3 rounded-full border-2 border-white top-1/2 -translate-y-1/2 shadow-sm transition-transform ${hoveredClusterId === cluster.id ? 'scale-150 z-10' : 'hover:scale-125'}`}
                             style={{ left: `${cluster.percent}%`, backgroundColor: MARKER_COLORS[cluster.primaryType] }}
                             onMouseEnter={() => setHoveredClusterId(cluster.id)}
                             onClick={(e) => { e.stopPropagation(); jumpToTime(cluster.offsetMs); }}
                           />
                         ))}

                         {/* Hover Tooltip */}
                         {hoveredCluster && (
                           <div
                             className="absolute bottom-full mb-3 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap z-20 animate-fade-in pointer-events-none"
                             style={{ left: `${hoveredCluster.percent}%` }}
                           >
                             <div className="font-semibold mb-0.5">{hoveredCluster.count > 1 ? `${hoveredCluster.count} Events` : MARKER_LABELS[hoveredCluster.primaryType]}</div>
                             <div className="text-slate-300">{formatDuration(hoveredCluster.offsetMs)} - {hoveredCluster.detail}</div>
                             <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                           </div>
                         )}

                         {/* Playhead thumb */}
                         <div 
                           className="absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full shadow-md top-1/2 -translate-y-1/2 -ml-[7px] pointer-events-none transition-transform group-hover:scale-125"
                           style={{ left: `${playbackPercent}%` }}
                         />
                      </div>

                      {/* Control Bar (Minimal & Centered) */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="w-1/3 flex items-center gap-4 text-xs font-medium text-slate-500 font-mono">
                          <span>{formatDuration(replayCurrentTime)}</span>
                          <span className="text-slate-300">/</span>
                          <span>{formatDuration(sessionDurationMs)}</span>
                        </div>
                        
                        <div className="w-1/3 flex items-center justify-center gap-3">
                          <button onClick={() => jumpToTime(Math.max(0, replayCurrentTime - 10000))} className="text-slate-400 hover:text-slate-900 transition-colors">
                            <span className="text-[10px] font-bold">10s</span>
                            <Icons.ChevronLeft className="w-4 h-4 inline" />
                          </button>
                          
                          <Button variant="primary" size="icon" onClick={togglePlayback} className="w-10 h-10 shadow-md">
                            {isPlaying ? <Icons.Pause className="w-5 h-5" /> : <Icons.Play className="w-5 h-5 ml-1" />}
                          </Button>
                          
                          <button onClick={() => jumpToTime(Math.min(sessionDurationMs, replayCurrentTime + 10000))} className="text-slate-400 hover:text-slate-900 transition-colors">
                            <Icons.ChevronRight className="w-4 h-4 inline" />
                            <span className="text-[10px] font-bold">10s</span>
                          </button>
                        </div>
                        
                        <div className="w-1/3 flex items-center justify-end gap-2">
                           {[1, 2, 4].map(speed => (
                             <button
                               key={speed}
                               onClick={() => handleSpeedChange(speed)}
                               className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${playbackSpeed === speed ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                             >
                               {speed}x
                             </button>
                           ))}
                           <div className="w-px h-4 bg-slate-200 mx-1"></div>
                           <Button variant="ghost" size="icon" className="text-slate-500 w-8 h-8 rounded" title="Fullscreen">
                             <Icons.Expand className="w-4 h-4" />
                           </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
