const coordinate = (value) => Math.round(value * 100) / 100;
const pointText = ({ x, y }) => `${coordinate(x)},${coordinate(y)}`;

export const addPaintingPoint = (points, point) => {
  const previous = points[points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.75) {
    previous.pressure = point.pressure;
    return;
  }
  points.push(point);
  // Keep very long gestures bounded without truncating the end of the stroke.
  if (points.length > 4096) points.splice(1, points.length - 2, ...points.slice(1, -1).filter((_, index) => index % 2 === 0));
};

const smoothEdge = (points) => {
  let d = `L${pointText(points[0])}`;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    d += ` Q${pointText(previous)} ${pointText({ x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 })}`;
  }
  return `${d} L${pointText(points[points.length - 1])}`;
};

export const paintingPath = ({ points, size, tool }) => {
  if (!points.length) return "";
  const radius = (point) => size / 2 * (tool === "brush" ? 0.35 + point.pressure * 1.3 : 1);
  if (points.length === 1) {
    const point = points[0];
    const r = coordinate(radius(point));
    return `M${coordinate(point.x - r)},${coordinate(point.y)} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
  }
  const left = [], right = [];
  let pressure = points[0].pressure;
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const distance = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    pressure += (point.pressure - pressure) * 0.35;
    const r = radius({ pressure });
    const nx = -(after.y - before.y) / distance * r;
    const ny = (after.x - before.x) / distance * r;
    left.push({ x: point.x + nx, y: point.y + ny });
    right.push({ x: point.x - nx, y: point.y - ny });
  });
  const endRadius = coordinate(radius({ pressure }));
  const startRadius = coordinate(radius(points[0]));
  return `M${pointText(left[0])} ${smoothEdge(left)} A${endRadius},${endRadius} 0 0,0 ${pointText(right[right.length - 1])} ${smoothEdge(right.reverse())} A${startRadius},${startRadius} 0 0,0 ${pointText(left[0])} Z`;
};

export const paintHistory = (history, action) => {
  if (action.type === "undo") {
    if (!history.past.length) return history;
    return {
      past: history.past.slice(0, -1), present: history.past[history.past.length - 1],
      future: [history.present, ...history.future],
    };
  }
  if (action.type === "redo") {
    if (!history.future.length) return history;
    return {
      past: [...history.past, history.present], present: history.future[0],
      future: history.future.slice(1),
    };
  }
  return {
    past: [...history.past.slice(-39), history.present],
    present: action.type === "clear" ? [] : [...history.present, action.stroke],
    future: [],
  };
};

export const paintingExportSize = (width, height, density = 2) => {
  const scale = Math.min(Math.max(1, density), 3, 3072 / Math.max(width, height), Math.sqrt(4000000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
};
