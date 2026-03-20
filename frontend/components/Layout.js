import Navbar from "@/components/Navbar";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-grid-pattern">
      <Navbar />
      <div className="bg-gradient-orb pointer-events-none fixed inset-0 -z-10" />
      <main className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
