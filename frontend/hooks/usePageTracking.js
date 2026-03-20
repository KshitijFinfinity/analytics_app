import { useEffect } from "react";
import { trackEvent } from "@/utils/analytics";

export function usePageTracking(pageName) {
  useEffect(() => {
    trackEvent("page_view", { page: pageName });
  }, [pageName]);
}
