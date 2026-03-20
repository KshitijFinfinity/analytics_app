import { createContext, useContext, useMemo, useState } from "react";

const WorkspaceContext = createContext(null);

export const RANGE_PRESETS = {
  "24h": { label: "Last 24 hours", days: 1 },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  custom: { label: "Custom range", days: null },
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoISO(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function resolveRange(rangePreset, customRange) {
  if (rangePreset !== "custom") {
    const preset = RANGE_PRESETS[rangePreset] || RANGE_PRESETS["7d"];
    return {
      startDate: daysAgoISO(preset.days),
      endDate: todayISO(),
      label: preset.label,
    };
  }

  return {
    startDate: customRange.startDate || daysAgoISO(7),
    endDate: customRange.endDate || todayISO(),
    label: RANGE_PRESETS.custom.label,
  };
}

export function WorkspaceProvider({ children }) {
  const [rangePreset, setRangePreset] = useState("7d");
  const [customRange, setCustomRange] = useState({
    startDate: daysAgoISO(7),
    endDate: todayISO(),
  });
  const [searchText, setSearchText] = useState("");
  const [environment, setEnvironment] = useState("production");

  const resolvedRange = useMemo(
    () => resolveRange(rangePreset, customRange),
    [customRange, rangePreset]
  );

  const value = useMemo(
    () => ({
      rangePreset,
      setRangePreset,
      customRange,
      setCustomRange,
      resolvedRange,
      searchText,
      setSearchText,
      environment,
      setEnvironment,
    }),
    [customRange, environment, rangePreset, resolvedRange, searchText]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return value;
}
