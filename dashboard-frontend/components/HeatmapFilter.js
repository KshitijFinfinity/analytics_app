import React, { useState, useEffect } from "react";

export default function HeatmapFilter({
  pages = [],
  onFilterChange,
  initialFilters = {},
}) {
  const [heatmapType, setHeatmapType] = useState(initialFilters.heatmapType || "click");
  const [selectedPage, setSelectedPage] = useState(initialFilters.selectedPage || "");
  const [startDate, setStartDate] = useState(initialFilters.startDate || getDefaultStartDate());
  const [endDate, setEndDate] = useState(initialFilters.endDate || new Date().toISOString().split("T")[0]);
  const [useAggregated, setUseAggregated] = useState(initialFilters.useAggregated !== false);

  function getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  }

  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        heatmapType,
        selectedPage,
        startDate,
        endDate,
        useAggregated,
      });
    }
  }, [heatmapType, selectedPage, startDate, endDate, useAggregated, onFilterChange]);

  const handleResetFilters = () => {
    setHeatmapType("click");
    setSelectedPage("");
    setStartDate(getDefaultStartDate());
    setEndDate(new Date().toISOString().split("T")[0]);
    setUseAggregated(true);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Filters</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Heatmap Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Heatmap Type</label>
          <select
            value={heatmapType}
            onChange={(e) => setHeatmapType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="click">Click Heatmap</option>
            <option value="scroll">Scroll Heatmap</option>
          </select>
        </div>

        {/* Page URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Page URL</label>
          <select
            value={selectedPage}
            onChange={(e) => setSelectedPage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- Select a page --</option>
            {pages.map((page) => (
              <option key={page} value={page}>
                {page || "(root)"}
              </option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Use Aggregated Data */}
        <div className="flex items-end">
          <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useAggregated}
              onChange={(e) => setUseAggregated(e.target.checked)}
              className="w-4 h-4 border border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2">Use Aggregated Data</span>
          </label>
        </div>

        {/* Reset Button */}
        <div className="flex items-end">
          <button
            onClick={handleResetFilters}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Info Text */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <strong>Tip:</strong> Use aggregated data for better performance when viewing large date ranges.
        Select a specific date for detailed raw data.
      </div>
    </div>
  );
}
