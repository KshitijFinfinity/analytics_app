import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function AnalyticsBarChart({ data, chartType = "bar" }) {
  const pieData = data.map((item) => ({ name: item.event_name, value: item.count }));

  return (
    <div className="h-full min-h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "line" ? (
          <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="event_name" interval={0} angle={-15} textAnchor="end" height={80} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#0f172a" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        ) : null}

        {chartType === "pie" ? (
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : null}

        {chartType === "bar" ? (
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="event_name" interval={0} angle={-15} textAnchor="end" height={80} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#0f172a" radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}
