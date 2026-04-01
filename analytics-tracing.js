// analytics-tracing.js
(function () {
  var PROJECT_ID = "YOUR_PROJECT_ID"; // <-- Replace with your project ID
  var ENDPOINT = "https://analyticsapp2-production.up.railway.app/api/track";
  var SCRIPT_URL = "https://analyticsapp2-production.up.railway.app/analytics.js";

  if (window.__analyticsTrackerInitByProject && window.__analyticsTrackerInitByProject[PROJECT_ID]) return;
  window.__analyticsTrackerInitByProject = window.__analyticsTrackerInitByProject || {};
  window.__analyticsTrackerInitByProject[PROJECT_ID] = true;

  var script = document.createElement("script");
  script.src = SCRIPT_URL;
  script.async = true;
  script.setAttribute("data-project-id", PROJECT_ID);
  script.setAttribute("data-endpoint", ENDPOINT);
  document.head.appendChild(script);
})();
