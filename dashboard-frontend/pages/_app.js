import "@/styles/globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import AppShell from "@/components/AppShell";
import { DashboardProvider } from "@/context/DashboardContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";

export default function App({ Component, pageProps }) {
  return (
    <WorkspaceProvider>
      <DashboardProvider>
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      </DashboardProvider>
    </WorkspaceProvider>
  );
}
