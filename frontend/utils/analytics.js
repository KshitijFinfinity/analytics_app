import analytics from "@/utils/analyticsClient";

export function trackEvent(eventName, properties = {}) {
  console.log("Tracking Event:", eventName, properties);
  analytics.track(eventName, properties);
}
