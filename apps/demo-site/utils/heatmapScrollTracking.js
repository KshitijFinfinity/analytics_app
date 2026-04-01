import { getOrCreateUserId, getOrCreateSessionId } from "./sessionMonitoring";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const SCROLL_THROTTLE_MS = 2000; // Throttle scroll updates to every 2 seconds
const SCROLL_DEPTH_THRESHOLD = 5; // Only record if depth changes by 5%

let maxScrollDepth = 0;
let lastScrollDepth = 0;
let lastScrollUpdate = 0;
let scrollTrackingEnabled = false;
let scrollThrottleTimer = null;

function calculateScrollDepth() {
  try {
    // Calculate scroll depth as a percentage
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    
    const viewportHeight = window.innerHeight;
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    
    // Handle edge case where content is shorter than viewport
    if (scrollHeight <= viewportHeight) {
      return 100;
    }
    
    const depth = (scrollPosition + viewportHeight) / scrollHeight;
    return Math.min(Math.round(depth * 100), 100);
  } catch (error) {
    console.error("Error calculating scroll depth:", error);
    return 0;
  }
}

function getViewportInfo() {
  return {
    viewportHeight: window.innerHeight,
    documentHeight: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ),
  };
}

async function sendScrollEvent(scrollData) {
  try {
    try {
      const response = await fetch(`${BASE_URL}/api/heatmap/scroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scrollData),
      });
      if (response.ok) {
        return true;
      }
    } catch {}
  } catch (error) {
    console.error("Failed to send scroll event:", error);
  }

  return false;
}

function handleScrollEvent() {
  if (!scrollTrackingEnabled) {
    return;
  }

  try {
    const currentTime = Date.now();
    const currentScrollDepth = calculateScrollDepth();

    // Update max scroll depth
    if (currentScrollDepth > maxScrollDepth) {
      maxScrollDepth = currentScrollDepth;
    }

    // Check if enough time has passed and depth has changed significantly
    const timeSinceLastUpdate = currentTime - lastScrollUpdate;
    const depthDelta = Math.abs(currentScrollDepth - lastScrollDepth);

    if (
      timeSinceLastUpdate >= SCROLL_THROTTLE_MS ||
      (depthDelta >= SCROLL_DEPTH_THRESHOLD && currentScrollDepth === 100)
    ) {
      lastScrollUpdate = currentTime;
      lastScrollDepth = currentScrollDepth;

      const viewportInfo = getViewportInfo();

      const scrollEvent = {
        user_id: getOrCreateUserId(),
        session_id: getOrCreateSessionId(),
        page_url: window.location.pathname,
        scroll_depth_percentage: maxScrollDepth,
        viewport_height: viewportInfo.viewportHeight,
        document_height: viewportInfo.documentHeight,
        timestamp: new Date().toISOString(),
      };

      // Send scroll event
      sendScrollEvent(scrollEvent);
    }
  } catch (error) {
    console.error("Error handling scroll event:", error);
  }
}

function handleScrollThrottled() {
  // Clear existing timer
  if (scrollThrottleTimer) {
    clearTimeout(scrollThrottleTimer);
  }

  // Set new throttled call
  scrollThrottleTimer = setTimeout(handleScrollEvent, 100);
}

function recordMaxScrollOnUnload() {
  try {
    if (maxScrollDepth > 0) {
      const viewportInfo = getViewportInfo();

      const scrollEvent = {
        user_id: getOrCreateUserId(),
        session_id: getOrCreateSessionId(),
        page_url: window.location.pathname,
        scroll_depth_percentage: maxScrollDepth,
        viewport_height: viewportInfo.viewportHeight,
        document_height: viewportInfo.documentHeight,
        timestamp: new Date().toISOString(),
      };

      // Use keepalive flag for unload request
      navigator.sendBeacon(
        `${BACKEND_BASES[0]}/heatmap/scroll`,
        JSON.stringify(scrollEvent)
      );
    }
  } catch (error) {
    console.error("Error recording scroll on unload:", error);
  }
}

export function initializeScrollTracking() {
  if (scrollTrackingEnabled) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  try {
    scrollTrackingEnabled = true;
    maxScrollDepth = calculateScrollDepth();
    lastScrollDepth = maxScrollDepth;
    lastScrollUpdate = Date.now();

    // Listen to scroll events
    window.addEventListener("scroll", handleScrollThrottled, { passive: true });

    // Record final scroll depth on page unload
    window.addEventListener("beforeunload", recordMaxScrollOnUnload);

    console.log("Scroll tracking initialized");
  } catch (error) {
    console.error("Failed to initialize scroll tracking:", error);
    scrollTrackingEnabled = false;
  }
}

export function stopScrollTracking() {
  if (!scrollTrackingEnabled) {
    return;
  }

  try {
    scrollTrackingEnabled = false;
    window.removeEventListener("scroll", handleScrollThrottled);
    window.removeEventListener("beforeunload", recordMaxScrollOnUnload);

    if (scrollThrottleTimer) {
      clearTimeout(scrollThrottleTimer);
      scrollThrottleTimer = null;
    }

    console.log("Scroll tracking stopped");
  } catch (error) {
    console.error("Failed to stop scroll tracking:", error);
  }
}

export function isScrollTrackingActive() {
  return scrollTrackingEnabled;
}

export function getCurrentScrollDepth() {
  return calculateScrollDepth();
}

export function getMaxScrollDepth() {
  return maxScrollDepth;
}
