import "@/styles/globals.css";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Manrope, Sora } from "next/font/google";
import Layout from "@/components/Layout";
import { trackEvent } from "@/utils/analytics";
import { startSessionRecording, trackNavigationForReplay } from "@/utils/sessionMonitoring";
import { initializeClickTracking, stopClickTracking } from "@/utils/heatmapClickTracking";
import { initializeHoverTracking, stopHoverTracking } from "@/utils/heatmapHoverTracking";
import { initializeScrollTracking, stopScrollTracking } from "@/utils/heatmapScrollTracking";
import { capturePageSnapshot, initializeSnapshotTracking, stopSnapshotTracking } from "@/utils/pageSnapshotTracking";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const stopRecording = startSessionRecording();
    initializeClickTracking();
    initializeHoverTracking();
    initializeScrollTracking();
    initializeSnapshotTracking();

    return () => {
      if (typeof stopRecording === "function") stopRecording();
      stopClickTracking();
      stopHoverTracking();
      stopScrollTracking();
      stopSnapshotTracking();
    };
  }, []);

  useEffect(() => {
    const onRouteDone = (url) => {
      const destination = url.replace("/", "") || "home";
      trackEvent("navigation_clicked", { destination });
      trackNavigationForReplay(url);
      capturePageSnapshot("route_change");
    };

    router.events.on("routeChangeComplete", onRouteDone);
    return () => router.events.off("routeChangeComplete", onRouteDone);
  }, [router.events]);

  return (
    <main className={`${manrope.variable} ${sora.variable}`}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </main>
  );
}