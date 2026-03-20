import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#14b8a6"];

export default function ChartRenderer({ chartType, data, fillHeight = false, emptyLabel = "No data for this configuration." }) {
  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 ${
          fillHeight ? "h-full min-h-[240px]" : "h-[320px]"
        }`}
      >
        {emptyLabel}
      </div>
    );
  }

  const pieData = data.map((item) => ({ name: item.label, value: Number(item.count || 0) }));

  return (
    <div className={`min-w-0 w-full ${fillHeight ? "h-full min-h-[240px]" : "h-[320px]"}`} style={{ minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "line" ? (
          <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 2.5 }} />
          </LineChart>
        ) : null}

        {chartType === "bar" ? (
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#0f172a" radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : null}

        {chartType === "stacked-bar" ? (
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="primary" stackId="a" fill="#0f172a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="secondary" stackId="a" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : null}

        {chartType === "area" ? (
          <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={72} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#bae6fd" strokeWidth={2} />
          </AreaChart>
        ) : null}

        {chartType === "pie" ? (
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={112} label>
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}
