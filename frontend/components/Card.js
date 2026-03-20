export default function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={`glass-panel rounded-2xl p-6 shadow-[0_14px_32px_rgba(15,23,42,0.07)] ${className}`}>
      {title ? <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">{title}</h2> : null}
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-5" : ""}>{children}</div>
    </section>
  );
}
