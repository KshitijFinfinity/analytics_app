const SEGMENT_COLORS = [
  ["#f97316", "#fb7185"],
  ["#f59e0b", "#f97316"],
  ["#eab308", "#f59e0b"],
  ["#38bdf8", "#0ea5e9"],
  ["#34d399", "#10b981"],
];

const VIEWBOX_WIDTH = 100;
const SEGMENT_HEIGHT = 18;
const SEGMENT_GAP = 2;
const SIDE_PADDING = 10;
const MIN_BOTTOM_RATIO = 0.18;

function normalizeSteps(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((item, index) => ({
      id: `${item?.event_name || item?.step || "step"}-${index}`,
      label: String(item?.event_name || item?.step || item?.label || `Step ${index + 1}`),
      users: Math.max(0, Number(item?.users || item?.count || 0)),
      conversion: item?.conversion_rate_from_previous == null ? null : Number(item.conversion_rate_from_previous),
    }))
    .filter((item) => item.label);
}

function getStepWidths(steps) {
  const maxUsers = Math.max(...steps.map((step) => step.users), 0);
  const drawableWidth = VIEWBOX_WIDTH - SIDE_PADDING * 2;

  return steps.map((step, index) => {
    if (maxUsers <= 0) {
      return index === 0 ? drawableWidth : drawableWidth * MIN_BOTTOM_RATIO;
    }

    return Math.max((step.users / maxUsers) * drawableWidth, drawableWidth * MIN_BOTTOM_RATIO);
  });
}

function toTitleCaseLabel(value) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AnalyticsFunnelChart({ data, fitContainer = false }) {
  const steps = normalizeSteps(data);

  if (steps.length === 0) {
    return (
      <div className="flex h-[360px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        No funnel data available for this configuration.
      </div>
    );
  }

  const widths = getStepWidths(steps);
  const totalHeight = steps.length * SEGMENT_HEIGHT + (steps.length - 1) * SEGMENT_GAP;
  const containerHeight = Math.max(360, steps.length * 96);
  const containerStyle = fitContainer ? { height: "100%" } : { height: `${containerHeight}px` };

  return (
    <div className={`w-full ${fitContainer ? "h-full" : ""}`} style={containerStyle}>
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${totalHeight + 10}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {steps.map((step, index) => {
            const [start, end] = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
            return (
              <linearGradient key={`gradient-${step.id}`} id={`gradient-${step.id}`} x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor={start} />
                <stop offset="100%" stopColor={end} />
              </linearGradient>
            );
          })}
        </defs>

        {steps.map((step, index) => {
          const topWidth = widths[index];
          const bottomWidth =
            index < widths.length - 1
              ? widths[index + 1]
              : Math.max(topWidth * 0.72, (VIEWBOX_WIDTH - SIDE_PADDING * 2) * MIN_BOTTOM_RATIO);
          const y = index * (SEGMENT_HEIGHT + SEGMENT_GAP);
          const topLeftX = (VIEWBOX_WIDTH - topWidth) / 2;
          const topRightX = topLeftX + topWidth;
          const bottomLeftX = (VIEWBOX_WIDTH - bottomWidth) / 2;
          const bottomRightX = bottomLeftX + bottomWidth;
          const centerY = y + SEGMENT_HEIGHT / 2;
          const conversionY = y + SEGMENT_HEIGHT + SEGMENT_GAP / 2 + 0.6;
          const polygonPoints = `${topLeftX},${y} ${topRightX},${y} ${bottomRightX},${y + SEGMENT_HEIGHT} ${bottomLeftX},${y + SEGMENT_HEIGHT}`;

          return (
            <g key={step.id}>
              <polygon
                points={polygonPoints}
                fill={`url(#gradient-${step.id})`}
                stroke="rgba(15, 23, 42, 0.10)"
                strokeWidth="0.5"
              />
              <text x="50" y={centerY - 1.2} textAnchor="middle" fill="#ffffff" fontSize="4.2" fontWeight="700">
                {step.users}
              </text>
              <text x="50" y={centerY + 3.2} textAnchor="middle" fill="#ffffff" fontSize="2.8" fontWeight="500">
                {toTitleCaseLabel(step.label)}
              </text>
              {index > 0 && step.conversion != null ? (
                <text x="50" y={conversionY} textAnchor="middle" fill="#475569" fontSize="2.5" fontWeight="600">
                  {step.conversion}% conversion
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
