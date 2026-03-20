import { useEffect, useMemo, useRef, useState } from "react";

function getBlobStyle(point) {
  const warm = Math.round(185 - point.intensity * 155);
  const centerAlpha = 0.26 + point.intensity * 0.5;
  const midAlpha = 0.17 + point.intensity * 0.38;
  const outerAlpha = 0.09 + point.intensity * 0.16;
  const edgeAlpha = 0.03 + point.intensity * 0.09;

  return {
    left: `${point.centerX * 100}%`,
    top: `${point.centerY * 100}%`,
    width: `${point.size}px`,
    height: `${point.size}px`,
    transform: "translate(-50%, -50%)",
    borderRadius: "9999px",
    background: `radial-gradient(circle, rgba(255, 78, ${warm}, ${centerAlpha}) 0%, rgba(255, 183, 79, ${midAlpha}) 30%, rgba(118, 225, 139, ${outerAlpha}) 58%, rgba(94, 183, 255, ${edgeAlpha}) 100%)`,
    filter: "blur(13px) saturate(120%)",
    boxShadow: `0 0 ${Math.round(point.size * 0.32)}px rgba(255, 120, 70, 0.32), 0 0 ${Math.round(point.size * 0.56)}px rgba(103, 199, 255, 0.22)`,
    opacity: 0.4 + point.intensity * 0.56,
  };
}

function sanitizeParsedDocument(parsedDocument) {
  parsedDocument.querySelectorAll("script, noscript, iframe, object, embed").forEach((node) => {
    node.remove();
  });

  parsedDocument.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name === "src" || name === "action") && /^javascript:/i.test(value.trim())) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return parsedDocument;
}

export default function IframeHeatmapOverlay({
  pageUrl,
  cells,
  snapshot,
  loading,
  bucketSize = 0.05,
  mode = "hover",
}) {
  const scrollContainerRef = useRef(null);
  const stageRef = useRef(null);
  const snapshotHostRef = useRef(null);
  const [renderError, setRenderError] = useState(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });

  const visiblePoints = useMemo(() => {
    const source = Array.isArray(cells) ? cells : [];
    const intensityField = mode === "hover" ? "hover_count" : "click_count";
    const maxValue = source.reduce((max, cell) => Math.max(max, Number(cell?.[intensityField]) || 0), 0);
    const baseRadius = Math.max(52, Math.min(146, Math.round(bucketSize * 1240)));

    return source
      .map((cell) => {
        const xPercent = Number(cell.x_percent);
        const yPercent = Number(cell.y_percent);
        const value = Number(cell[intensityField]) || 0;

        if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent) || value <= 0 || maxValue <= 0) {
          return null;
        }

        return {
          key: `${xPercent}-${yPercent}`,
          centerX: Math.min(0.995, Math.max(0.005, xPercent + bucketSize / 2)),
          centerY: Math.min(0.995, Math.max(0.005, yPercent + bucketSize / 2)),
          value,
          intensity: value / maxValue,
          size: Math.round(baseRadius + (value / maxValue) * baseRadius * 1.55),
        };
      })
      .filter(Boolean);
  }, [bucketSize, cells, mode]);

  const visibleMarkers = useMemo(() => {
    if (mode !== "click") {
      return [];
    }

    return [...visiblePoints]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((point, index) => ({
        ...point,
        rank: index + 1,
      }));
  }, [mode, visiblePoints]);

  const maxValue = useMemo(
    () => visiblePoints.reduce((max, point) => Math.max(max, point.value), 0),
    [visiblePoints]
  );

  useEffect(() => {
    if (!snapshot?.dom_snapshot || !snapshotHostRef.current) return;

    try {
      const host = snapshotHostRef.current;
      const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
      const parser = new DOMParser();
      const parsedDocument = sanitizeParsedDocument(
        parser.parseFromString(snapshot.dom_snapshot, "text/html")
      );
      const snapshotWidth = Number(snapshot.document_width) || 1280;
      const snapshotHeight = Number(snapshot.document_height) || 720;

      shadowRoot.innerHTML = "";

      const resetStyles = document.createElement("style");
      resetStyles.textContent = `
        :host {
          display: block;
          color: initial;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        img, video, canvas, svg {
          max-width: 100%;
        }

        .snapshot-html {
          position: relative;
          min-width: ${snapshotWidth}px;
          min-height: ${snapshotHeight}px;
        }

        .snapshot-body {
          position: relative;
          min-width: ${snapshotWidth}px;
          min-height: ${snapshotHeight}px;
          overflow: hidden;
        }
      `;
      shadowRoot.appendChild(resetStyles);

      Array.from(parsedDocument.head.children)
        .filter((node) => {
          const tagName = node.tagName?.toLowerCase();
          return tagName === "style" || tagName === "link" || tagName === "base";
        })
        .forEach((node) => {
          shadowRoot.appendChild(node.cloneNode(true));
        });

      const htmlContainer = document.createElement("div");
      htmlContainer.className = `snapshot-html ${parsedDocument.documentElement.className || ""}`.trim();
      if (parsedDocument.documentElement.getAttribute("style")) {
        htmlContainer.setAttribute("style", parsedDocument.documentElement.getAttribute("style"));
      }

      const bodyContainer = document.createElement("div");
      bodyContainer.className = `snapshot-body ${parsedDocument.body?.className || ""}`.trim();
      const inlineBodyStyle = parsedDocument.body?.getAttribute("style") || "";
      bodyContainer.setAttribute(
        "style",
        `${inlineBodyStyle}; min-width: ${snapshotWidth}px; min-height: ${snapshotHeight}px; position: relative;`
      );
      bodyContainer.innerHTML = parsedDocument.body?.innerHTML || "";

      htmlContainer.appendChild(bodyContainer);
      shadowRoot.appendChild(htmlContainer);
      if (renderError) {
        queueMicrotask(() => setRenderError(null));
      }

      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = Number(snapshot.scroll_y) || 0;
          scrollContainerRef.current.scrollLeft = Number(snapshot.scroll_x) || 0;
        }
      });
    } catch (error) {
      console.error("Failed to render snapshot viewer:", error);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRenderError("The stored snapshot could not be rendered.");
    }
  }, [renderError, snapshot]);

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.round(entries[0]?.contentRect?.width || 0);
      const nextHeight = Math.round(entries[0]?.contentRect?.height || 0);
      setRenderedSize((previous) => {
        if (previous.width === nextWidth && previous.height === nextHeight) {
          return previous;
        }

        return { width: nextWidth, height: nextHeight };
      });
    });

    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [snapshot]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot Viewer</p>
            <p className="text-sm text-slate-700">
              {mode === "hover"
                ? "The stored page snapshot is rendered directly in the dashboard with a blended hover heat cloud over full-page document coordinates."
                : "The stored page snapshot is rendered directly in the dashboard with ranked click hotspots and smooth intensity blending."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold">Page:</span> {pageUrl}
            </div>
            <div>
              <span className="font-semibold">Captured:</span>{" "}
              {snapshot?.captured_at ? new Date(snapshot.captured_at).toLocaleString() : "No snapshot"}
            </div>
          </div>
        </div>
      </header>

      <div className="p-5">
        {!snapshot?.dom_snapshot ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-600">
            No stored DOM snapshot is available for the current filters yet. Open the tracked page in the website frontend to capture one.
          </div>
        ) : renderError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{renderError}</div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="overflow-auto rounded-xl border border-slate-300 bg-slate-100"
            style={{ maxHeight: "75vh" }}
          >
            <div
              ref={stageRef}
              className="relative"
              style={{
                minWidth: `${Number(snapshot.document_width) || 1280}px`,
                minHeight: `${Number(snapshot.document_height) || 720}px`,
              }}
            >
              <div
                ref={snapshotHostRef}
                className="relative bg-white"
                style={{
                  minWidth: `${Number(snapshot.document_width) || 1280}px`,
                  minHeight: `${Number(snapshot.document_height) || 720}px`,
                }}
              />

              <div
                className="pointer-events-none absolute inset-0 z-10"
                aria-label="heatmap-smooth-overlay"
                style={{
                  background: "linear-gradient(180deg, rgba(124, 58, 237, 0.06) 0%, rgba(14, 165, 233, 0.05) 100%)",
                }}
              >
                {visiblePoints.map((point) => (
                  <div
                    key={point.key}
                    className="absolute"
                    style={getBlobStyle(point)}
                  />
                ))}

                {visibleMarkers.map((marker) => (
                  <div
                    key={`${marker.key}-marker`}
                    className="absolute"
                    style={{
                      left: `${marker.centerX * 100}%`,
                      top: `${marker.centerY * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="relative flex items-center gap-1.5">
                      <div
                        className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#0b7fd7] text-xs font-bold text-white"
                        style={{
                          boxShadow:
                            "0 8px 16px rgba(8, 38, 83, 0.28), 0 0 0 1px rgba(255,255,255,0.28) inset",
                        }}
                      >
                        {marker.rank}
                      </div>

                      <div
                        className="rounded-full border border-slate-200 bg-white/96 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                        style={{
                          boxShadow: "0 6px 14px rgba(15, 23, 42, 0.16)",
                        }}
                      >
                        {marker.value.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border border-slate-200 bg-white/92 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur-sm">
                <div>
                  Snapshot: {renderedSize.width && renderedSize.height ? "rendered" : "loading"}
                </div>
                <div>
                  Size: {renderedSize.width && renderedSize.height ? `${renderedSize.width}x${renderedSize.height}` : "initializing"}
                </div>
                <div>Hotspots: {visiblePoints.length}</div>
                <div>Peak: {maxValue}</div>
              </div>

              <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-800 shadow">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-300" /> Cool
                </div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Warm
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-600" /> Hot
                </div>
              </div>

              {(loading || (snapshot?.dom_snapshot && !renderedSize.width && !renderedSize.height)) && (
                <div className="absolute inset-0 z-30 grid place-items-center bg-white/70 backdrop-blur-[1px]">
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
                    Rendering snapshot heatmap...
                  </div>
                </div>
              )}

              {!loading && renderedSize.width > 0 && renderedSize.height > 0 && visiblePoints.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
                  <div className="rounded-lg border border-slate-200 bg-white/92 px-4 py-2 text-sm text-slate-700 shadow-sm">
                    No {mode} hotspot data for the current filters.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}