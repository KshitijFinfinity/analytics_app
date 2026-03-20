import { createContext, useContext, useEffect, useState } from "react";

const DashboardContext = createContext(null);

const DASHBOARD_WIDGETS_KEY = "analytics_overview_widgets_v2";
const DASHBOARD_LAYOUTS_KEY = "analytics_overview_layouts_v2";
const DASHBOARD_LIBRARY_KEY = "analytics_dashboard_widget_library";

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function makeId(prefix = "widget") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeWidget(input = {}) {
  return {
    id: input.id || makeId("dashboard"),
    libraryId: input.libraryId || "",
    type: input.type || "custom",
    title: input.title || "Untitled Widget",
    chartType: input.chartType || "line",
    source: input.source || "custom",
    sourcePage: input.sourcePage || "",
    sourceLabel: input.sourceLabel || "",
    description: input.description || "",
    groupBy: input.groupBy || "event_name",
    selectedEvents: Array.isArray(input.selectedEvents) ? input.selectedEvents : [],
    filterText: input.filterText || "",
    breakdown: input.breakdown || "none",
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    data: Array.isArray(input.data) ? input.data : [],
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function normalizeLibraryWidget(input = {}) {
  return {
    id: input.id || input.libraryId || makeId("library"),
    type: input.type || "custom",
    title: input.title || "Untitled Widget",
    chartType: input.chartType || "line",
    source: input.source || "custom-library",
    sourcePage: input.sourcePage || "",
    sourceLabel: input.sourceLabel || "",
    description: input.description || "",
    groupBy: input.groupBy || "event_name",
    selectedEvents: Array.isArray(input.selectedEvents) ? input.selectedEvents : [],
    filterText: input.filterText || "",
    breakdown: input.breakdown || "none",
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    data: Array.isArray(input.data) ? input.data : [],
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function getRecommendedHeight(widget) {
  const isFunnel = widget?.type === "funnel-chart" || widget?.chartType === "funnel";
  if (!isFunnel) {
    return { h: 5, minH: 4 };
  }

  const steps = Array.isArray(widget?.data) ? widget.data.length : 0;
  const h = Math.max(8, Math.min(20, 4 + Math.ceil(steps * 1.6)));
  return { h, minH: Math.min(h, Math.max(7, h - 2)) };
}

function applyWidgetLayoutSizing(layoutItem, widget) {
  const sizing = getRecommendedHeight(widget);
  return {
    ...layoutItem,
    h: Math.max(Number(layoutItem?.h || 0), sizing.h),
    minH: Math.max(Number(layoutItem?.minH || 0), sizing.minH),
  };
}

function normalizeLayoutsForWidgets(layouts, widgets) {
  const widgetById = new Map((widgets || []).map((widget) => [widget.id, widget]));
  const resize = (items = []) =>
    items.map((item) => {
      const widget = widgetById.get(item.i);
      if (!widget) return item;
      return applyWidgetLayoutSizing(item, widget);
    });

  return {
    lg: resize(layouts?.lg || []),
    md: resize(layouts?.md || []),
    sm: resize(layouts?.sm || []),
  };
}

function appendLayoutItem(layouts, widget) {
  const sizing = getRecommendedHeight(widget);
  const baseItem = {
    i: widget.id,
    x: 0,
    y: Infinity,
    w: 4,
    h: sizing.h,
    minW: 3,
    minH: sizing.minH,
  };

  return {
    lg: [...(layouts?.lg || []), baseItem],
    md: [...(layouts?.md || []), { ...baseItem, w: 6 }],
    sm: [...(layouts?.sm || []), { ...baseItem, w: 12 }],
  };
}

function removeLayoutItem(layouts, widgetId) {
  return {
    lg: (layouts?.lg || []).filter((item) => item.i !== widgetId),
    md: (layouts?.md || []).filter((item) => item.i !== widgetId),
    sm: (layouts?.sm || []).filter((item) => item.i !== widgetId),
  };
}

function upsertLibraryEntry(entries, entry) {
  const nextEntry = normalizeLibraryWidget(entry);
  const existingIndex = entries.findIndex((item) => item.id === nextEntry.id);
  if (existingIndex === -1) {
    return [nextEntry, ...entries];
  }

  return entries.map((item) => (item.id === nextEntry.id ? nextEntry : item));
}

function mergeLinkedWidget(existingWidget, patch = {}) {
  return {
    ...existingWidget,
    title: patch.title ?? existingWidget.title,
    chartType: patch.chartType ?? existingWidget.chartType,
    type: patch.type ?? existingWidget.type,
    sourcePage: patch.sourcePage ?? existingWidget.sourcePage,
    sourceLabel: patch.sourceLabel ?? existingWidget.sourceLabel,
    description: patch.description ?? existingWidget.description,
    groupBy: patch.groupBy ?? existingWidget.groupBy,
    selectedEvents: Array.isArray(patch.selectedEvents) ? patch.selectedEvents : existingWidget.selectedEvents,
    filterText: patch.filterText ?? existingWidget.filterText,
    breakdown: patch.breakdown ?? existingWidget.breakdown,
    startDate: patch.startDate ?? existingWidget.startDate,
    endDate: patch.endDate ?? existingWidget.endDate,
    data: Array.isArray(patch.data) ? patch.data : existingWidget.data,
  };
}

export function DashboardProvider({ children }) {
  const [dashboardWidgets, setDashboardWidgets] = useState([]);
  const [dashboardLayouts, setDashboardLayouts] = useState({ lg: [], md: [], sm: [] });
  const [widgetLibrary, setWidgetLibrary] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedWidgets = safeParse(window.localStorage.getItem(DASHBOARD_WIDGETS_KEY), []);
    const savedLayouts = safeParse(window.localStorage.getItem(DASHBOARD_LAYOUTS_KEY), { lg: [], md: [], sm: [] });
    const savedLibrary = safeParse(window.localStorage.getItem(DASHBOARD_LIBRARY_KEY), []);

    const normalizedWidgets = Array.isArray(savedWidgets) ? savedWidgets.map(normalizeWidget) : [];
    const normalizedLayouts = savedLayouts && typeof savedLayouts === "object" ? savedLayouts : { lg: [], md: [], sm: [] };

    /* eslint-disable react-hooks/set-state-in-effect */
    setDashboardWidgets(normalizedWidgets);
    setDashboardLayouts(normalizeLayoutsForWidgets(normalizedLayouts, normalizedWidgets));
    setWidgetLibrary(Array.isArray(savedLibrary) ? savedLibrary.map(normalizeLibraryWidget) : []);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_WIDGETS_KEY, JSON.stringify(dashboardWidgets));
  }, [dashboardWidgets, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_LAYOUTS_KEY, JSON.stringify(dashboardLayouts));
  }, [dashboardLayouts, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_LIBRARY_KEY, JSON.stringify(widgetLibrary));
  }, [hydrated, widgetLibrary]);

  function saveWidgetToLibrary(widgetInput) {
    const libraryEntry = normalizeLibraryWidget(widgetInput);
    setWidgetLibrary((prev) => upsertLibraryEntry(prev, libraryEntry));
    return libraryEntry;
  }

  function addWidgetToDashboard(widgetInput, options = {}) {
    const { saveToLibrary = true } = options;

    let libraryEntry = null;
    if (saveToLibrary) {
      libraryEntry = saveWidgetToLibrary(widgetInput);
    }

    const widget = normalizeWidget({
      ...widgetInput,
      libraryId: widgetInput.libraryId || libraryEntry?.id || "",
      source: widgetInput.source || (libraryEntry ? "custom-library" : "custom"),
    });

    setDashboardWidgets((prev) => [widget, ...prev]);
    setDashboardLayouts((prev) => appendLayoutItem(prev, widget));

    return widget;
  }

  function addLibraryWidgetToDashboard(libraryId) {
    const match = widgetLibrary.find((item) => item.id === libraryId);
    if (!match) return null;

    return addWidgetToDashboard(
      {
        ...match,
        libraryId: match.id,
        source: "custom-library",
      },
      { saveToLibrary: false }
    );
  }

  function updateDashboardWidget(widgetId, patch) {
    setDashboardWidgets((prev) => prev.map((item) => (item.id === widgetId ? { ...item, ...patch } : item)));
  }

  function removeDashboardWidget(widgetId) {
    setDashboardWidgets((prev) => prev.filter((item) => item.id !== widgetId));
    setDashboardLayouts((prev) => removeLayoutItem(prev, widgetId));
  }

  function removeLibraryWidget(libraryId) {
    setWidgetLibrary((prev) => prev.filter((item) => item.id !== libraryId));
  }

  function updateLibraryWidget(libraryId, patch = {}, options = {}) {
    const { syncDashboard = true } = options;

    setWidgetLibrary((prev) =>
      prev.map((item) =>
        item.id === libraryId
          ? normalizeLibraryWidget({
              ...item,
              ...patch,
              id: libraryId,
            })
          : item
      )
    );

    if (!syncDashboard) return;

    setDashboardWidgets((prev) =>
      prev.map((item) => (item.libraryId === libraryId ? mergeLinkedWidget(item, patch) : item))
    );
  }

  function clearDashboard() {
    setDashboardWidgets([]);
    setDashboardLayouts({ lg: [], md: [], sm: [] });
  }

  const value = {
    dashboardWidgets,
    dashboardLayouts,
    setDashboardLayouts,
    widgetLibrary,
    hydrated,
    addWidgetToDashboard,
    addLibraryWidgetToDashboard,
    updateDashboardWidget,
    removeDashboardWidget,
    saveWidgetToLibrary,
    removeLibraryWidget,
    updateLibraryWidget,
    clearDashboard,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }

  return value;
}