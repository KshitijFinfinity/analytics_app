export function Button({ 
  children, 
  variant = "primary", // primary, secondary, ghost, icon
  size = "md", // sm, md, lg
  className = "", 
  disabled = false,
  ...props 
}) {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-250 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none";
  
  const variants = {
    primary: "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm hover:shadow-md hover:-translate-y-[1px] hover:brightness-105 rounded-full",
    secondary: "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 rounded-full",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg",
    icon: "text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full",
  };
  
  const sizes = {
    sm: variant === "icon" ? "p-1.5" : "px-3 py-1.5 text-xs",
    md: variant === "icon" ? "p-2" : "px-4 py-2 text-sm",
    lg: variant === "icon" ? "p-3" : "px-6 py-3 text-base",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
