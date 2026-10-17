"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../public/site/site-i18n";
import { getApiUrl } from "../_lib/apiUrl";
import { buildInvitationGraph } from "../_lib/invitationGraph";
import { createTrafficAnimator, drawInvitationTraffic, MAX_TRAFFIC_PULSES, validateTraffic } from "../_lib/invitationTraffic";

const number = new Intl.NumberFormat("ko-KR");

const validateMap = (data) => {
  if (!data || typeof data.snapshotId !== "string" || !data.snapshotId ||
      data.mode !== "live" || !Number.isInteger(data.totalUsers) ||
      data.totalUsers < 0 || !Array.isArray(data.nodes) || data.nodes.length > 2000 ||
      data.nodes.some((node) => !node || !Number.isInteger(node.id) ||
        typeof node.label !== "string" || node.label.length < 1 || node.label.length > 4 ||
        (node.parentId !== null && !Number.isInteger(node.parentId))) ||
      new Set(data.nodes.map((node) => node.id)).size !== data.nodes.length) {
    throw new Error("Invalid invitation map response");
  }
  return data;
};

function NetworkMap({ graph, traffic, selectedIndex, onSelect, zoomControl, status, onStatusChange }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const trafficCanvasRef = useRef(null);
  const samplesRef = useRef([]);
  const animateRef = useRef(null);
  const ready = status === "webgl";
  const unavailable = status === "unavailable";

  useEffect(() => {
    const now = performance.now();
    const ids = new Set(traffic.map((sample) => sample.id));
    samplesRef.current = [
      ...samplesRef.current.filter((sample) => now - sample.startedAt < 3000 && !ids.has(sample.id)),
      ...traffic.map((sample) => ({ ...sample, startedAt: now })),
    ].slice(-MAX_TRAFFIC_PULSES);
    animateRef.current?.();
  }, [traffic]);

  useEffect(() => {
    const network = networkRef.current;
    const canvas = trafficCanvasRef.current;
    if (!ready || !network || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      console.error("Unable to create invitation traffic canvas");
      return;
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inViewport = true;
    const draw = () => {
      const { width, height } = network.getDimensions();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return drawInvitationTraffic(context, network, graph, samplesRef.current, performance.now(), motion.matches);
    };
    const animator = createTrafficAnimator({
      draw,
      isVisible: () => inViewport && document.visibilityState !== "hidden",
      now: () => performance.now(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (id) => clearTimeout(id),
    });
    const updateVisibility = () => {
      if (inViewport && document.visibilityState !== "hidden") animator.schedule();
      else animator.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      updateVisibility();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", updateVisibility);
    animateRef.current = animator.schedule;
    network.on("afterRender", animator.schedule);
    animator.schedule();
    return () => {
      network.off("afterRender", animator.schedule);
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      animator.dispose();
      animateRef.current = null;
      samplesRef.current = [];
    };
  }, [graph, ready]);

  useEffect(() => {
    let network;
    let observer;
    let disposed = false;
    onStatusChange("loading");
    const initialize = async () => {
      try {
        const [{ default: Sigma }, { pathCurved, extremityArrow, layerGradient }] = await Promise.all([
          import("sigma"), import("sigma/rendering"),
        ]);
        if (disposed) return;
        network = new Sigma(graph.network, containerRef.current, {
          primitives: {
            edges: {
              paths: [pathCurved({ curvature: 0.18, segments: 16 })],
              extremities: [extremityArrow()],
              defaultHead: "arrow",
              layers: [layerGradient({ stops: [{ node: "source" }, { node: "target" }] })],
            },
          },
          customNodeState: { isRelated: false },
          customEdgeState: { isRelated: false },
          styles: {
            nodes: {
              label: (attributes) => attributes.label,
              labelVisibility: "auto",
              labelSize: 10,
              labelColor: "#e8eef5",
              color: (attributes, state) => state.isHighlighted ? "#ffffff" : attributes.color,
              size: (attributes, state) => attributes.size + (state.isHighlighted || state.isHovered ? 3 : 0),
              opacity: (_attributes, state) => state.isRelated || state.isHovered ? 1 : 0.35,
              backdropVisibility: (_attributes, state) => state.isHighlighted || state.isHovered ? "visible" : "hidden",
              backdropArea: "node",
              backdropColor: "#14283a",
              backdropBorderColor: "#67e8c1",
              backdropBorderWidth: 1.5,
              backdropShadowColor: "#67e8c1",
              backdropShadowBlur: 14,
              backdropPadding: 4,
              depth: (_attributes, state) => state.isHighlighted || state.isHovered ? "topNodes" : "nodes",
            },
            edges: {
              path: "curved",
              head: "arrow",
              size: (_attributes, state) => state.isRelated ? 1.5 : 0.7,
              opacity: (_attributes, state) => state.isRelated ? 0.85 : 0.12,
            },
          },
          settings: {
            stagePadding: 48,
            minCameraRatio: 0.0001,
            maxCameraRatio: 3,
            enableNodeDrag: false,
            enableCameraRotation: false,
            renderLabels: true,
            hideLabelsOnMove: true,
            hideEdgesOnMove: graph.nodes.length >= 1000,
            labelDensity: 0.5,
            labelGridCellSize: 70,
            labelRenderedSizeThreshold: 0,
          },
        });
        network.on("clickNode", ({ node }) => onSelect(graph.network.getNodeAttribute(node, "index")));
        observer = new ResizeObserver(([entry]) => {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) network.resize();
        });
        observer.observe(containerRef.current);
        networkRef.current = network;
        onStatusChange("webgl");
      } catch (failure) {
        observer?.disconnect();
        network?.kill();
        network = undefined;
        networkRef.current = null;
        if (disposed) return;
        console.error("Unable to render invitation WebGL tree:", failure);
        onStatusChange("unavailable");
      }
    };
    initialize();
    return () => {
      disposed = true;
      observer?.disconnect();
      network?.kill();
      networkRef.current = null;
    };
  }, [graph, onSelect, onStatusChange]);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    const selected = graph.nodes[selectedIndex];
    if (!selected) return;
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const related = new Set();
    let ancestor = selected;
    while (ancestor) {
      related.add(`node-${ancestor.id}`);
      ancestor = byId.get(ancestor.parentId);
    }
    const descendants = [...selected.children];
    for (let index = 0; index < descendants.length; index += 1) {
      const child = descendants[index];
      related.add(`node-${child.id}`);
      descendants.push(...child.children);
    }
    for (const node of graph.nodes) network.setNodeState(`node-${node.id}`, {
      isHighlighted: node.id === selected.id,
      isRelated: related.has(`node-${node.id}`),
    });
    for (const edge of graph.edges) network.setEdgeState(edge.id, {
      isRelated: related.has(edge.source) && related.has(edge.target),
    });
  }, [graph, selectedIndex, ready]);
  useEffect(() => {
    const network = networkRef.current;
    if (!network || !zoomControl) return;
    const camera = network.getCamera();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    if (zoomControl.action === "fit") camera.reset({ duration });
    else if (zoomControl.action === "in") camera.zoomIn({ factor: 1.5, duration });
    else camera.zoomOut({ factor: 1.5, duration });
  }, [zoomControl]);
  return (
    <div className="invitation-canvas-wrap" data-renderer={ready ? "webgl" : unavailable ? "unavailable" : "loading"}>
      <div
        ref={containerRef}
        className="invitation-network"
        role="img"
        aria-label={t("invitations.mapLabel")}
        aria-describedby="invitation-map-help invitation-selected"
      />
      <canvas ref={trafficCanvasRef} className="invitation-traffic" aria-hidden="true" />
      {!ready && !unavailable && <p className="invitation-canvas-status" role="status">{t("invitations.loading")}</p>}
      {unavailable && <p className="invitation-canvas-error" role="alert">{t("invitations.webglFallback")}</p>}
    </div>
  );
}

export default function InvitationMap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomControl, setZoomControl] = useState(null);
  const [rendererStatus, setRendererStatus] = useState("loading");
  const [traffic, setTraffic] = useState([]);
  const [trafficStatus, setTrafficStatus] = useState("connecting");
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(`${getApiUrl()}/api/invitations/map`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Invitation map request failed (${response.status})`);
        return response.json();
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(validateMap(result));
        setSelectedIndex(Math.max(0, result.nodes.findIndex((node) => node.parentId === null)));
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        console.error("Unable to load invitation map:", failure);
        setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const ids = new Set(data.nodes.map((node) => node.id));
    let cursor = 0;
    let timer;
    setTraffic([]);
    setTrafficStatus("connecting");
    const poll = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 2000);
        return;
      }
      try {
        const query = new URLSearchParams({ snapshotId: data.snapshotId, after: String(cursor) });
        const response = await fetch(`${getApiUrl()}/api/invitations/map/traffic?${query}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (response.status === 409) {
          setTrafficStatus("connecting");
          setAttempt((value) => value + 1);
          return;
        }
        if (!response.ok) throw new Error(`Traffic request failed (${response.status})`);
        const result = validateTraffic(await response.json(), data.snapshotId, ids, cursor);
        if (controller.signal.aborted) return;
        cursor = result.cursor;
        setTraffic(result.nodes);
        setTrafficStatus("live");
      } catch (failure) {
        if (controller.signal.aborted) return;
        console.error("Unable to load live invitation traffic:", failure);
        setTraffic([]);
        setTrafficStatus("unavailable");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [data]);
  const graph = useMemo(() => buildInvitationGraph(data?.nodes || []), [data]);
  const select = useCallback((index) => setSelectedIndex(index), []);
  if (error) return (
    <div className="invitation-state" role="alert">
      <p>{t("invitations.loadError")}</p>
      <button className="button button-primary" onClick={() => setAttempt((value) => value + 1)}>{t("invitations.retry")}</button>
    </div>
  );
  if (!data) return <p className="invitation-state" role="status">{t("invitations.loading")}</p>;
  const selected = graph.nodes[selectedIndex];
  return (
    <section aria-labelledby="invitation-map-title">
      <dl className="invitation-metrics">
        {[
          [t("invitations.registered"), data.totalUsers],
          [t("invitations.shownNodes"), graph.nodes.length],
          [t("invitations.links"), graph.edgeCount],
          [t("invitations.depth"), graph.maxDepth + (graph.nodes.length ? 1 : 0)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number.format(value)}</dd></div>)}
      </dl>
      <div className="invitation-map-card">
        <div className="invitation-toolbar">
          <h2 id="invitation-map-title">{t("invitations.liveMap")}</h2>
          <div className="invitation-controls">
            <div role="group" aria-label={t("invitations.zoom")}>
              {[["out", "−"], ["fit", t("invitations.fit")], ["in", "+"]].map(([action, label]) =>
                <button key={action} disabled={rendererStatus !== "webgl"} aria-label={t(`invitations.zoom.${action}`)} onClick={() => setZoomControl({ action })}>{label}</button>)}
            </div>
          </div>
        </div>
        {graph.nodes.length ? <NetworkMap graph={graph} traffic={traffic} selectedIndex={selectedIndex} onSelect={select} zoomControl={zoomControl} status={rendererStatus} onStatusChange={setRendererStatus} /> : <p className="invitation-state">{t("invitations.empty")}</p>}
        <div className="invitation-map-footer">
          <p role="status">{t(`invitations.traffic.${trafficStatus}`)}</p>
          <div className="invitation-legend">
            <span><i className="invitation-generation" aria-hidden="true" />{t("invitations.direction")}</span>
            <span>{t("invitations.nodeSize")}</span>
          </div>
          <p id="invitation-map-help">{t("invitations.mapHelp")}</p>
          {!!selected && <div className="invitation-selection">
            <label htmlFor="invitation-node">{t("invitations.selectNode")}</label>
            <input id="invitation-node" type="range" min="0" max={graph.nodes.length - 1} value={selectedIndex} onChange={(event) => select(Number(event.target.value))} />
            <p id="invitation-selected" aria-live="polite">{t("invitations.selected", {
              id: selected.label, generation: selected.depth + 1, count: selected.children.length,
            })}</p>
          </div>}
        </div>
      </div>
      <p className="invitation-privacy">{t("invitations.privacy")}</p>
      {data.limited && <p className="invitation-privacy">{t("invitations.limited", { count: number.format(data.maxNodes) })}</p>}
    </section>
  );
}
