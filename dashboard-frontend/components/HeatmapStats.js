import React from "react";
import { Card } from "@/components/ui/Card";
import { Icons } from "@/components/ui/Icons";

export default function HeatmapStats({ stats = {}, loading = false }) {
  const {
    total_clicks = 0,
    total_scrolls = 0,
    total_hovers = 0,
    unique_users_clicks = 0,
    unique_users_scrolls = 0,
    unique_users_hovers = 0,
  } = stats;

  const statCards = [
    {
      label: "Total Clicks",
      value: total_clicks.toLocaleString(),
      icon: <Icons.Activity className="w-5 h-5 text-blue-500" />,
      color: "bg-blue-50",
    },
    {
      label: "Unique Clickers",
      value: unique_users_clicks.toLocaleString(),
      icon: <Icons.User className="w-5 h-5 text-purple-500" />,
      color: "bg-purple-50",
    },
    {
      label: "Total Scrolls",
      value: total_scrolls.toLocaleString(),
      icon: <Icons.Activity className="w-5 h-5 text-emerald-500" />,
      color: "bg-emerald-50",
    },
    {
      label: "Unique Scrollers",
      value: unique_users_scrolls.toLocaleString(),
      icon: <Icons.User className="w-5 h-5 text-orange-500" />,
      color: "bg-orange-50",
    },
    {
      label: "Total Hovers",
      value: total_hovers.toLocaleString(),
      icon: <Icons.Cursor className="w-5 h-5 text-cyan-500" />,
      color: "bg-cyan-50",
    },
    {
      label: "Unique Hoverers",
      value: unique_users_hovers.toLocaleString(),
      icon: <Icons.User className="w-5 h-5 text-rose-500" />,
      color: "bg-rose-50",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-1/2 mb-3"></div>
            <div className="h-7 bg-slate-100 rounded w-3/4"></div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((card, index) => (
        <Card key={index} className="px-4 py-4 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${card.color}`}>
              {card.icon}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </h3>
          </div>
          <p className="text-2xl font-display font-semibold text-slate-900 mt-1">
            {card.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
