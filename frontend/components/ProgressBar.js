export default function ProgressBar({ step, totalSteps }) {
  const percent = Math.round((step / totalSteps) * 100);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-600">
        <span>Application Progress</span>
        <span>
          Step {step} of {totalSteps}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
