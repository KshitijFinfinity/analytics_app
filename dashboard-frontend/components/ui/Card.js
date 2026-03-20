export function Card({ children, className = "", noPadding = false, hoverEffect = false, ...props }) {
  return (
    <div
      className={`
        bg-white rounded-2xl border border-[#e2e8f0]
        shadow-[0_4px_6px_-1px_rgb(0,0,0,0.02),0_2px_4px_-2px_rgb(0,0,0,0.02)]
        ${!noPadding ? "p-6" : ""}
        ${hoverEffect ? "transition-all duration-250 hover:shadow-[0_10px_25px_-3px_rgb(0,0,0,0.05),0_4px_6px_-4px_rgb(0,0,0,0.03)] hover:-translate-y-[2px]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
