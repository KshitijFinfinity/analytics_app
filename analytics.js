(function () {
  "use strict";

  try {
    var USER_ID_KEY = "analytics_user_id";
    var SESSION_ID_KEY = "analytics_session_id";
    var DEFAULT_ENDPOINT = "https://yourdomain.com/track";
    var BATCH_SIZE = 10;
    var FLUSH_INTERVAL_MS = 2000;
    var CLICK_DEBOUNCE_MS = 150;
    var ROUTE_DEBOUNCE_MS = 250;
    var RAGE_WINDOW_MS = 1000;
    var RAGE_CLICK_COUNT = 3;
    var RAGE_AREA_PX = 48;

    var scriptEl =
      document.currentScript ||
      document.querySelector("script[data-project-id][src*='analytics.js']") ||
      document.querySelector("script[data-project-id]");

    var projectId = scriptEl && scriptEl.getAttribute("data-project-id");
    var endpoint = (scriptEl && scriptEl.getAttribute("data-endpoint")) || DEFAULT_ENDPOINT;

    if (!projectId) {
      return;
    }

    function now() {
      return Date.now();
    }

    function safeJsonParse(raw, fallback) {
      try {
        if (!raw) return fallback;
        var parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (_err) {
        return fallback;
      }
    }

    function randomId(prefix) {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return prefix ? prefix + "_" + window.crypto.randomUUID() : window.crypto.randomUUID();
      }
      var suffix = Math.random().toString(36).slice(2, 10);
      return (prefix ? prefix + "_" : "") + now() + "_" + suffix;
    }

    function getOrCreateStorageValue(storage, key, prefix) {
      try {
        var existing = storage.getItem(key);
        if (existing) return existing;
        var next = randomId(prefix);
        storage.setItem(key, next);
        return next;
      } catch (_err) {
        return randomId(prefix);
      }
    }

    var userId = getOrCreateStorageValue(window.localStorage, USER_ID_KEY, "u");
    var sessionId = getOrCreateStorageValue(window.sessionStorage, SESSION_ID_KEY, "s");
    var userProperties = safeJsonParse(window.localStorage.getItem("analytics_user_properties"), {});
    var queue = [];
    var flushTimer = null;
    var lastEventByKey = new Map();
    var clickHistory = [];

    function safeGetPathname() {
      try {
        return window.location.pathname;
      } catch (_err) {
        return "";
      }
    }

    function safeGetHref() {
      try {
        return window.location.href;
      } catch (_err) {
        return "";
      }
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = window.setTimeout(function () {
        flushTimer = null;
        flushQueue();
      }, FLUSH_INTERVAL_MS);
    }

    function shouldDropFrequentEvent(eventName, properties) {
      if (eventName !== "click") return false;
      var key = "click:" + String((properties && properties.tag) || "") + ":" + String((properties && properties.id) || "");
      var lastAt = lastEventByKey.get(key) || 0;
      var ts = now();
      if (ts - lastAt < CLICK_DEBOUNCE_MS) {
        return true;
      }
      lastEventByKey.set(key, ts);
      return false;
    }

    function sendEvent(eventPayload) {
      if (!eventPayload) return;

      var body = JSON.stringify(eventPayload);

      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([body], { type: "application/json" });
          var ok = navigator.sendBeacon(endpoint, blob);
          if (ok) return;
        }
      } catch (_err) {
        // Fall through to fetch.
      }

      try {
        window.fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: body,
          keepalive: true,
          credentials: "omit",
        }).catch(function () {
          // Swallow network errors to avoid impacting host app.
        });
      } catch (_err) {
        // Ignore all transport errors.
      }
    }

    function sendBatch(events) {
      if (!events || events.length === 0) return;
      for (var i = 0; i < events.length; i += 1) {
        sendEvent(events[i]);
      }
    }

    function flushQueue() {
      try {
        if (queue.length === 0) return;
        var toSend = queue.splice(0, queue.length);
        sendBatch(toSend);
      } catch (_err) {
        // Never throw from analytics internals.
      }
    }

    function enqueue(payload) {
      queue.push(payload);
      if (queue.length >= BATCH_SIZE) {
        flushQueue();
        return;
      }
      scheduleFlush();
    }

    function track(eventName, properties) {
      try {
        var nextProps = properties && typeof properties === "object" ? properties : {};

        if (shouldDropFrequentEvent(eventName, nextProps)) {
          return;
        }

        var payload = {
          project_id: projectId,
          user_id: userId,
          session_id: sessionId,
          event_name: eventName,
          page: safeGetPathname(),
          url: safeGetHref(),
          timestamp: now(),
          properties: Object.assign({}, userProperties, nextProps),
        };

        enqueue(payload);
      } catch (_err) {
        // Never throw from public API.
      }
    }

    function identify(nextUserId) {
      try {
        if (!nextUserId) return;
        userId = String(nextUserId);
        window.localStorage.setItem(USER_ID_KEY, userId);
      } catch (_err) {
        // Ignore storage failures.
      }
    }

    function setUserProperties(props) {
      try {
        if (!props || typeof props !== "object") return;
        userProperties = Object.assign({}, userProperties, props);
        window.localStorage.setItem("analytics_user_properties", JSON.stringify(userProperties));
      } catch (_err) {
        // Ignore persistence failures.
      }
    }

    function onRouteChange() {
      track("page_view");
    }

    function debounce(fn, wait) {
      var timeoutId = null;
      return function debounced() {
        var args = arguments;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(function () {
          timeoutId = null;
          try {
            fn.apply(null, args);
          } catch (_err) {
            // Ignore callback errors.
          }
        }, wait);
      };
    }

    var debouncedRouteChange = debounce(onRouteChange, ROUTE_DEBOUNCE_MS);

    function patchHistoryMethod(name) {
      try {
        var original = history[name];
        if (typeof original !== "function") return;

        history[name] = function patchedHistoryMethod() {
          var result = original.apply(this, arguments);
          debouncedRouteChange();
          return result;
        };
      } catch (_err) {
        // Ignore monkey-patch failures.
      }
    }

    function bucketClickArea(x, y) {
      var bx = Math.floor((x || 0) / RAGE_AREA_PX);
      var by = Math.floor((y || 0) / RAGE_AREA_PX);
      return bx + ":" + by;
    }

    function detectRageClick(event) {
      try {
        var ts = now();
        var area = bucketClickArea(event && event.clientX, event && event.clientY);

        clickHistory.push({ t: ts, area: area });
        clickHistory = clickHistory.filter(function (entry) {
          return ts - entry.t <= RAGE_WINDOW_MS;
        });

        var sameAreaCount = 0;
        for (var i = clickHistory.length - 1; i >= 0; i -= 1) {
          if (clickHistory[i].area === area) {
            sameAreaCount += 1;
          }
        }

        if (sameAreaCount >= RAGE_CLICK_COUNT) {
          track("rage_click", {
            area: area,
            click_count: sameAreaCount,
          });
          clickHistory = [];
        }
      } catch (_err) {
        // Ignore rage detection errors.
      }
    }

    document.addEventListener(
      "click",
      function (e) {
        try {
          var target = (e && e.target) || {};
          track("click", {
            tag: target.tagName || "",
            text: String((target.innerText || target.textContent || "")).slice(0, 50),
            id: target.id || "",
            class: target.className || "",
          });
          detectRageClick(e);
        } catch (_err) {
          // Ignore click tracking errors.
        }
      },
      { capture: true, passive: true }
    );

    window.addEventListener("error", function (e) {
      try {
        track("error", {
          message: e && e.message,
          source: e && e.filename,
          line: e && e.lineno,
        });
      } catch (_err) {
        // Ignore.
      }
    });

    window.addEventListener("unhandledrejection", function (e) {
      try {
        var reason = e && e.reason;
        track("promise_error", {
          message: typeof reason === "string" ? reason : (reason && reason.message) || String(reason),
        });
      } catch (_err) {
        // Ignore.
      }
    });

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
    window.addEventListener("popstate", debouncedRouteChange);
    window.addEventListener("hashchange", debouncedRouteChange);

    window.addEventListener("beforeunload", function () {
      flushQueue();
    });

    track("page_view");

    window.analytics = {
      track: track,
      identify: identify,
      setUserProperties: setUserProperties,
    };
  } catch (_fatalErr) {
    // Intentionally swallow all top-level failures.
  }
})();
