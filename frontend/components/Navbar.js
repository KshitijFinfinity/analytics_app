import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/utils/analytics";
import NotificationsDropdown from "@/components/NotificationsDropdown";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/loan-offers", label: "Offers" },
  { href: "/eligibility", label: "Eligibility" },
  { href: "/application-status", label: "Status" },
  { href: "/profile", label: "Profile" },
  { href: "/apply-loan", label: "Apply" },
];

export default function Navbar() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();

  const onNavClick = (href) => {
    const destination = href.replace("/", "") || "home";
    trackEvent("navigation_clicked", { destination });
  };

  const handleLogout = () => {
    logout();
    trackEvent("logout_clicked");
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/82 backdrop-blur-xl">
      <nav className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="brand-ring inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-700 to-emerald-600 text-xs font-bold text-white">
            FL
          </span>
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-slate-900"
            onClick={() => onNavClick("/")}
          >
            FluxLend
          </Link>
        </div>

        <div className="order-3 flex w-full items-center gap-2 overflow-x-auto pb-1 md:order-2 md:w-auto md:overflow-visible md:pb-0">
          {navItems.map((item) => {
            const isActive = !item.external && router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => onNavClick(item.href)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="order-2 flex items-center gap-2 sm:gap-3 md:order-3">
          {isAuthenticated ? <NotificationsDropdown /> : null}

          {!isAuthenticated ? (
            <>
              <Link
                href="/signup"
                onClick={() => onNavClick("/signup")}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                onClick={() => onNavClick("/login")}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Login
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
