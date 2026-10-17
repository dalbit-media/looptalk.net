import { hierarchy, tree } from "d3-hierarchy";
import { DirectedGraph } from "graphology";

export const invitationPalette = ["#67e8c1", "#67c5f5", "#a3a0ff", "#e6a0e8", "#ffc879", "#f58d9c"];

export const buildInvitationGraph = (input) => {
  const nodes = input.map((node) => ({ ...node, children: [], depth: 0 }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const parent = byId.get(node.parentId);
    if (parent && parent !== node) parent.children.push(node);
    else node.parentId = null;
  }
  const roots = nodes.filter((node) => node.parentId === null);
  const visited = new Set();
  const visit = (root) => {
    root.parentId = null;
    const queue = [root];
    visited.add(root.id);
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      for (const child of node.children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        child.depth = node.depth + 1;
        queue.push(child);
      }
    }
  };
  roots.forEach(visit);
  for (const node of nodes) if (!visited.has(node.id)) visit(node);
  for (const node of nodes) node.children = node.children.filter((child) => child.parentId === node.id);
  const network = new DirectedGraph();
  if (nodes.length) {
    const forest = nodes.filter((node) => node.parentId === null);
    const root = hierarchy(forest.length === 1 ? forest[0] : { children: forest }).sum(() => 1);
    tree()
      .size([2 * Math.PI, Math.max(1, root.height) * 100])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth))(root);
    root.each((point) => {
      if (point.data.id === undefined) return;
      const node = point.data;
      node.x = Math.cos(point.x - Math.PI / 2) * point.y;
      node.y = Math.sin(point.x - Math.PI / 2) * point.y;
      node.descendants = point.value - 1;
    });
    nodes.forEach((node, index) => network.addNode(`node-${node.id}`, {
      x: node.x, y: node.y, index,
      label: node.label,
      size: 4 + Math.min(8, Math.log2(node.descendants + 1) * 1.2),
      color: invitationPalette[node.depth % invitationPalette.length],
    }));
  }
  const edges = nodes.filter((node) => node.parentId !== null).map((node) => ({
    id: `edge-${node.id}`, source: `node-${node.parentId}`, target: `node-${node.id}`,
  }));
  for (const edge of edges) network.addDirectedEdgeWithKey(edge.id, edge.source, edge.target);
  return {
    nodes,
    edges,
    network,
    edgeCount: edges.length,
    maxDepth: nodes.reduce((depth, node) => Math.max(depth, node.depth), 0),
  };
};
