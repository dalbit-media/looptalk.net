export const formatTrafficBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit]}`;
};

export const validateTraffic = (data, snapshotId, ids, previousCursor) => {
  if (!data || data.snapshotId !== snapshotId || !Number.isSafeInteger(data.cursor) ||
      data.cursor < previousCursor || !Array.isArray(data.nodes) || data.nodes.length > ids.size ||
      new Set(data.nodes.map((node) => node?.id)).size !== data.nodes.length ||
      data.nodes.some((node) => !node || !ids.has(node.id) ||
        !Number.isSafeInteger(node.inBytes) || node.inBytes < 0 ||
        !Number.isSafeInteger(node.outBytes) || node.outBytes < 0)) {
    throw new Error("Invalid invitation traffic response");
  }
  return data;
};

export const drawInvitationTraffic = (context, network, graph, samples, now, reducedMotion) => {
  const occupied = new Set();
  const showLabels = network.getCamera().getState().ratio <= Math.min(1, Math.sqrt(100 / graph.nodes.length));
  const { width, height } = network.getDimensions();
  context.clearRect(0, 0, width, height);
  context.font = "10px sans-serif";
  context.textAlign = "center";
  let active = false;
  for (const sample of samples.slice(-MAX_TRAFFIC_PULSES)) {
    const elapsed = now - sample.startedAt;
    if (elapsed < 0 || elapsed >= 3000) continue;
    const key = `node-${sample.id}`;
    if (!graph.network.hasNode(key)) continue;
    const point = network.graphToViewport(graph.network.getNodeAttributes(key));
    if (point.x < -70 || point.y < -70 || point.x > width + 70 || point.y > height + 70) continue;
    active = true;
    context.globalAlpha = Math.min(1, (3000 - elapsed) / 600);
    const progress = reducedMotion ? 0.6 : (elapsed % 1100) / 1100;
    for (const [bytes, incoming] of [[sample.inBytes, true], [sample.outBytes, false]]) {
      if (!bytes) continue;
      const offset = incoming ? -48 * (1 - progress) : 48 * progress;
      const y = point.y + (incoming ? -7 : 7);
      context.strokeStyle = context.fillStyle = incoming ? "#ffc879" : "#67e8c1";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(point.x + offset - 12, y);
      context.lineTo(point.x + offset, y);
      context.stroke();
      context.beginPath();
      context.moveTo(point.x + offset, y);
      context.lineTo(point.x + offset - 5, y - 3);
      context.lineTo(point.x + offset - 5, y + 3);
      context.fill();
    }
    const cell = `${Math.floor(point.x / 110)}:${Math.floor(point.y / 40)}`;
    if (showLabels && !occupied.has(cell)) {
      occupied.add(cell);
      const label = [
        sample.outBytes ? `↑ ≈${formatTrafficBytes(sample.outBytes)}` : "",
        sample.inBytes ? `↓ ≈${formatTrafficBytes(sample.inBytes)}` : "",
      ].filter(Boolean).join("  ");
      context.fillStyle = "#0c1726";
      context.fillRect(point.x - context.measureText(label).width / 2 - 4, point.y - 30,
        context.measureText(label).width + 8, 15);
      context.fillStyle = "#e8eef5";
      context.fillText(label, point.x, point.y - 19);
    }
  }
  context.globalAlpha = 1;
  return active;
};
export const MAX_TRAFFIC_PULSES = 128;

export const createTrafficAnimator = ({
  draw, isVisible, now, requestFrame, cancelFrame, setTimer, clearTimer,
}) => {
  let frame = null;
  let timer = null;
  let lastDraw = -Infinity;
  let interval = 1000 / 30;
  let disposed = false;
  const pause = () => {
    if (frame !== null) cancelFrame(frame);
    if (timer !== null) clearTimer(timer);
    frame = timer = null;
  };
  const render = () => {
    frame = null;
    if (disposed || !isVisible()) return;
    const started = now();
    const active = draw();
    lastDraw = now();
    // Slow devices get extra breathing room instead of accumulating render work.
    interval = Math.max(1000 / 30, Math.min(200, (lastDraw - started) * 2));
    if (active) schedule();
  };
  const schedule = () => {
    if (disposed || !isVisible() || frame !== null || timer !== null) return;
    const delay = Math.max(0, lastDraw + interval - now());
    if (delay > 0) {
      timer = setTimer(() => {
        timer = null;
        if (!disposed && isVisible()) frame = requestFrame(render);
      }, delay);
    } else {
      frame = requestFrame(render);
    }
  };
  return {
    schedule,
    pause,
    dispose: () => { disposed = true; pause(); },
  };
};
