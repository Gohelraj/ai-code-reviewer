import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { ExecutionFlow } from "../types";
import "@xyflow/react/dist/style.css";

const LAYER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  route: { bg: "bg-blue-50 dark:bg-blue-900/30", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300" },
  controller: { bg: "bg-purple-50 dark:bg-purple-900/30", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300" },
  service: { bg: "bg-emerald-50 dark:bg-emerald-900/30", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-700 dark:text-emerald-300" },
  model: { bg: "bg-orange-50 dark:bg-orange-900/30", border: "border-orange-300 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300" },
  dal: { bg: "bg-amber-50 dark:bg-amber-900/30", border: "border-amber-300 dark:border-amber-700", text: "text-amber-700 dark:text-amber-300" },
  utility: { bg: "bg-gray-50 dark:bg-gray-800/50", border: "border-gray-300 dark:border-gray-600", text: "text-gray-700 dark:text-gray-300" },
  config: { bg: "bg-pink-50 dark:bg-pink-900/30", border: "border-pink-300 dark:border-pink-700", text: "text-pink-700 dark:text-pink-300" },
  test: { bg: "bg-cyan-50 dark:bg-cyan-900/30", border: "border-cyan-300 dark:border-cyan-700", text: "text-cyan-700 dark:text-cyan-300" },
};
const DEFAULT_COLOR = LAYER_COLORS.utility;

function getLayerColor(layer: string) {
  const key = layer.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(LAYER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_COLOR;
}

interface FlowNodeData {
  label: string;
  role: string;
  keyChanges: string;
  layer: string;
  layerColor: ReturnType<typeof getLayerColor>;
  [key: string]: unknown;
}

function FlowNode({ data }: { data: FlowNodeData }) {
  const c = data.layerColor;
  return (
    <div className={`px-4 py-3 rounded-xl border-2 ${c.bg} ${c.border} min-w-[180px] max-w-[260px] shadow-sm`}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground/40" />
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.text} px-1.5 py-0.5 rounded ${c.bg}`}>
          {data.layer}
        </span>
      </div>
      <p className="text-xs font-semibold text-foreground truncate" title={data.label}>
        {data.label}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2" title={data.role}>
        {data.role}
      </p>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground/40" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  flow: FlowNode as NodeTypes["default"],
};

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: 220, height: 90 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 110, y: pos.y - 45 },
    };
  });
}

interface FlowDiagramProps {
  flow: ExecutionFlow;
}

export function FlowDiagram({ flow }: FlowDiagramProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const fileToId = new Map<string, string>();

    // Create nodes from flow groups
    for (const group of flow.flowGroups) {
      const color = getLayerColor(group.layer);
      for (const file of group.files) {
        const id = `node-${file.filename}`;
        fileToId.set(file.filename, id);
        nodes.push({
          id,
          type: "flow",
          position: { x: 0, y: 0 },
          data: {
            label: file.filename,
            role: file.role,
            keyChanges: file.keyChanges,
            layer: group.layer,
            layerColor: color,
          },
        });
      }
    }

    // Create edges from callsInto
    for (const group of flow.flowGroups) {
      for (const file of group.files) {
        const sourceId = fileToId.get(file.filename);
        if (!sourceId || !file.callsInto) continue;
        for (const target of file.callsInto) {
          const targetId = fileToId.get(target);
          if (targetId) {
            edges.push({
              id: `edge-${sourceId}-${targetId}`,
              source: sourceId,
              target: targetId,
              animated: true,
              style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, opacity: 0.5 },
            });
          }
        }
      }
    }

    // Also create edges between layers (group order)
    const sortedGroups = [...flow.flowGroups].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedGroups.length - 1; i++) {
      const currentFiles = sortedGroups[i].files;
      const nextFiles = sortedGroups[i + 1].files;
      // Connect last file of current layer to first file of next layer (fallback if no callsInto)
      if (currentFiles.length > 0 && nextFiles.length > 0) {
        for (const cf of currentFiles) {
          if (cf.callsInto && cf.callsInto.length > 0) continue; // already connected
          const sourceId = fileToId.get(cf.filename);
          const targetId = fileToId.get(nextFiles[0].filename);
          if (sourceId && targetId && !edges.some((e) => e.source === sourceId && e.target === targetId)) {
            edges.push({
              id: `edge-layer-${sourceId}-${targetId}`,
              source: sourceId,
              target: targetId,
              style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, opacity: 0.3, strokeDasharray: "5 5" },
            });
          }
        }
      }
    }

    const laidOut = layoutGraph(nodes, edges);
    return { initialNodes: laidOut, initialEdges: edges };
  }, [flow]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback(() => {}, []);

  if (initialNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No flow data to visualize
      </div>
    );
  }

  return (
    <div className="h-[500px] rounded-2xl border border-border overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
