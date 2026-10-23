"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Globe,
  Clock,
  Code,
  Send,
  Hourglass,
  Layers,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Trash2,
  X,
  Sparkles,
  AlertTriangle,
  Link2,
  Settings2,
  Sliders,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { validateDAG } from "@/lib/dag/cycle-detector";

export type CoreNodeType =
  | "webhook_trigger"
  | "cron_trigger"
  | "transform_script"
  | "http_request"
  | "delay_timer";

export interface NodeConfig {
  url?: string;
  method?: string;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffCapMs?: number;
  cronExpression?: string;
  delayMs?: number;
  script?: string;
  headers?: Record<string, string>;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: CoreNodeType;
  category: "trigger" | "action";
  status: "idle" | "running" | "success";
  detail: string;
  badge: string;
  x: number;
  y: number;
  config?: NodeConfig;
}

export interface Connection {
  from: string;
  to: string;
}

export interface NodeTemplate {
  type: CoreNodeType;
  name: string;
  category: "trigger" | "action";
  badge: string;
  detail: string;
  description: string;
}

export const CORE_NODE_TEMPLATES: NodeTemplate[] = [
  // ── 1. Trigger Cards (The Starting Points) ──
  {
    type: "webhook_trigger",
    name: "Webhook Trigger",
    category: "trigger",
    badge: "TRIGGER",
    detail: "POST /api/v1/orders/settle",
    description:
      "Generates a unique URL. Listens for incoming HTTP POST requests from external systems and starts the workflow.",
  },
  {
    type: "cron_trigger",
    name: "Cron Trigger",
    category: "trigger",
    badge: "CRON",
    detail: "0 * * * * (Hourly Sync)",
    description:
      "Time-based starting point. Accepts standard cron expressions to schedule recurring workflow executions.",
  },
  // ── 2. Action Cards (The Execution Steps) ──
  {
    type: "transform_script",
    name: "Transform / Script",
    category: "action",
    badge: "TRANSFORM",
    detail: "payload.items.map(i => i.id)",
    description:
      "Takes the JSON payload from a previous node and filters, extracts, or modifies the data.",
  },
  {
    type: "http_request",
    name: "HTTP Request",
    category: "action",
    badge: "HTTP ACTION",
    detail: "POST https://api.stripe.com/v1",
    description:
      "Outbound action step making external API calls (GET/POST) with idempotency keys and retry limits.",
  },
  {
    type: "delay_timer",
    name: "Delay Node",
    category: "action",
    badge: "DELAY",
    detail: "Sleep 5000ms // BullMQ ZSET",
    description:
      "Halts the current branch for a specified duration before allowing downstream nodes to execute.",
  },
];

const INITIAL_NODES: WorkflowNode[] = [
  {
    id: "wh_1",
    name: "Webhook Trigger",
    type: "webhook_trigger",
    category: "trigger",
    status: "idle",
    detail: "POST /api/v1/orders/settle",
    badge: "TRIGGER",
    x: 100,
    y: 200,
    config: {
      url: "/api/v1/hooks/orders_settle",
      method: "POST",
    },
  },
  {
    id: "cron_1",
    name: "Cron Trigger",
    type: "cron_trigger",
    category: "trigger",
    status: "idle",
    detail: "0 * * * * (Hourly Sync)",
    badge: "CRON",
    x: 100,
    y: 380,
    config: {
      cronExpression: "0 * * * *",
    },
  },
  {
    id: "trans_1",
    name: "Transform / Script",
    type: "transform_script",
    category: "action",
    status: "idle",
    detail: "payload.items.map(i => i.id)",
    badge: "TRANSFORM",
    x: 430,
    y: 290,
    config: {
      script: "payload.items.map(i => i.id)",
    },
  },
  {
    id: "http_1",
    name: "HTTP Request",
    type: "http_request",
    category: "action",
    status: "idle",
    detail: "POST https://api.stripe.com/v1",
    badge: "HTTP ACTION",
    x: 760,
    y: 290,
    config: {
      url: "https://api.stripe.com/v1/charges",
      method: "POST",
      maxRetries: 3,
      baseBackoffMs: 1000,
      maxBackoffCapMs: 30000,
    },
  },
  {
    id: "delay_1",
    name: "Delay Node",
    type: "delay_timer",
    category: "action",
    status: "idle",
    detail: "Sleep 5000ms // BullMQ ZSET",
    badge: "DELAY",
    x: 1090,
    y: 290,
    config: {
      delayMs: 5000,
    },
  },
];

const INITIAL_CONNECTIONS: Connection[] = [
  { from: "wh_1", to: "trans_1" },
  { from: "cron_1", to: "trans_1" },
  { from: "trans_1", to: "http_1" },
  { from: "http_1", to: "delay_1" },
];

export function StudioView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [isRunning, setIsRunning] = useState(false);
  const [activeEdgeIndex, setActiveEdgeIndex] = useState<number>(-1);

  // Selected Node for Node Inspector Drawer (Target URL, Retries, Jitter Backoff)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("http_1");
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Bottom Drop-Up Sliding Drawer / Desk state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Wiring / Joining connection state
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan & Zoom Canvas State
  const [pan, setPan] = useState({ x: 30, y: 40 });
  const [scale, setScale] = useState(0.95);
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Node Dragging State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragStart = useRef({ x: 0, y: 0 });
  const nodeInitialPos = useRef({ x: 0, y: 0 });

  // Validate DAG in real time using cycle detection engine
  const dagValidation = React.useMemo(() => {
    return validateDAG(
      nodes.map((n) => ({ id: n.id })),
      connections.map((c, i) => ({ id: `e_${i}`, source: c.from, target: c.to }))
    );
  }, [nodes, connections]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Add Card to Canvas from Desk via click
  const addNodeToCanvas = (template: NodeTemplate) => {
    const id = `${template.type}_${Date.now().toString(36)}`;
    const offsetX = Math.round((-pan.x + window.innerWidth / 2 - 115) / scale + (Math.random() * 60 - 30));
    const offsetY = Math.round((-pan.y + window.innerHeight / 2 - 80) / scale + (Math.random() * 60 - 30));

    const newNode: WorkflowNode = {
      id,
      name: template.name,
      type: template.type,
      category: template.category,
      status: "idle",
      detail: template.detail,
      badge: template.badge,
      x: Math.max(40, offsetX),
      y: Math.max(120, offsetY),
    };

    setNodes((prev) => [...prev, newNode]);
    showToast(`Added "${template.name}" to canvas`);
  };

  // Drag and Drop from Node Desk onto Canvas
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = (e.dataTransfer.getData("application/chronograph-node-type") ||
      e.dataTransfer.getData("text/plain")) as CoreNodeType;

    const template = CORE_NODE_TEMPLATES.find((t) => t.type === nodeType);
    if (!template || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dropClientX = e.clientX - rect.left;
    const dropClientY = e.clientY - rect.top;

    // Convert screen coordinates to canvas world coordinates taking pan & scale into account
    const worldX = Math.round((dropClientX - pan.x) / scale - 115);
    const worldY = Math.round((dropClientY - pan.y) / scale - 48);

    const id = `${template.type}_${Date.now().toString(36)}`;
    const newNode: WorkflowNode = {
      id,
      name: template.name,
      type: template.type,
      category: template.category,
      status: "idle",
      detail: template.detail,
      badge: template.badge,
      x: Math.max(20, worldX),
      y: Math.max(80, worldY),
    };

    setNodes((prev) => [...prev, newNode]);
    showToast(`Dropped "${template.name}" onto canvas`);
  };

  // Update configuration parameters for a specific node (Target URL, Retries, Jitter Backoff)
  const updateNodeConfig = (nodeId: string, updates: Partial<NodeConfig>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const newConfig = { ...n.config, ...updates };
        let newDetail = n.detail;
        if (n.type === "http_request" && (updates.method || updates.url)) {
          newDetail = `${newConfig.method || "POST"} ${newConfig.url || "https://api.stripe.com/v1"}`;
        } else if (n.type === "cron_trigger" && updates.cronExpression) {
          newDetail = `${newConfig.cronExpression} (Scheduled)`;
        } else if (n.type === "delay_timer" && updates.delayMs !== undefined) {
          newDetail = `Sleep ${newConfig.delayMs}ms // BullMQ ZSET`;
        }
        return {
          ...n,
          detail: newDetail,
          config: newConfig,
        };
      })
    );
  };

  // Delete a node and its connections
  const deleteNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.from !== nodeId && c.to !== nodeId));
    if (connectingFromId === nodeId) {
      setConnectingFromId(null);
    }
  };

  // Delete a specific connection wire
  const deleteConnection = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnections((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle Port Click to Connect Nodes
  const handleOutputPortClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFromId === nodeId) {
      setConnectingFromId(null);
      return;
    }
    setConnectingFromId(nodeId);
    showToast(`Wiring from "${nodes.find((n) => n.id === nodeId)?.name}". Click input port on target card to join.`);
  };

  const handleInputPortClick = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingFromId) return;

    if (connectingFromId === targetNodeId) {
      showToast("Cannot connect a node to itself");
      setConnectingFromId(null);
      return;
    }

    const alreadyExists = connections.some(
      (c) => c.from === connectingFromId && c.to === targetNodeId
    );

    if (alreadyExists) {
      showToast("Connection already exists");
      setConnectingFromId(null);
      return;
    }

    const newConnections = [...connections, { from: connectingFromId, to: targetNodeId }];
    setConnections(newConnections);

    const check = validateDAG(
      nodes.map((n) => ({ id: n.id })),
      newConnections.map((c, i) => ({ id: `e_${i}`, source: c.from, target: c.to }))
    );

    if (!check.isValid) {
      showToast(`Warning: Cycle detected (${check.error})`);
    } else {
      showToast("Joined successfully!");
    }

    setConnectingFromId(null);
  };

  // Canvas Mouse Down: either drag node or pan canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest(".studio-node") ||
      (e.target as HTMLElement).closest(".canvas-control") ||
      (e.target as HTMLElement).closest(".node-port")
    ) {
      return;
    }
    setIsPanning(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      setMouseCanvasPos({
        x: (e.clientX - pan.x) / scale,
        y: (e.clientY - pan.y) / scale,
      });

      if (isPanning) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPan({
          x: panStart.current.x + dx,
          y: panStart.current.y + dy,
        });
      } else if (draggingNodeId) {
        const dx = (e.clientX - nodeDragStart.current.x) / scale;
        const dy = (e.clientY - nodeDragStart.current.y) / scale;
        setNodes((prev) =>
          prev.map((node) =>
            node.id === draggingNodeId
              ? {
                ...node,
                x: Math.round(nodeInitialPos.current.x + dx),
                y: Math.round(nodeInitialPos.current.y + dy),
              }
              : node
          )
        );
      }
    },
    [isPanning, draggingNodeId, scale, pan]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNodeId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connectingFromId) setConnectingFromId(null);
        if (isDrawerOpen) setIsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connectingFromId, isDrawerOpen]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if ((e.target as HTMLElement).closest(".node-port") || (e.target as HTMLElement).closest("button")) {
      return;
    }
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    nodeDragStart.current = { x: e.clientX, y: e.clientY };
    const n = nodes.find((item) => item.id === nodeId);
    if (n) {
      nodeInitialPos.current = { x: n.x, y: n.y };
    }
  };

  const runWorkflow = () => {
    if (isRunning) return;
    setIsRunning(true);
    setNodes((prev) => prev.map((n) => ({ ...n, status: "idle" })));

    const topoOrder =
      dagValidation.isValid && dagValidation.topologicalOrder.length > 0
        ? dagValidation.topologicalOrder
        : nodes.map((n) => n.id);

    topoOrder.forEach((nodeId, idx) => {
      setTimeout(() => {
        setActiveEdgeIndex(idx);
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, status: "running" } : n))
        );
      }, idx * 750);

      setTimeout(() => {
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, status: "success" } : n))
        );
      }, idx * 750 + 650);
    });

    setTimeout(() => {
      setIsRunning(false);
      setActiveEdgeIndex(-1);
    }, topoOrder.length * 750 + 800);
  };

  const resetWorkflow = () => {
    setIsRunning(false);
    setActiveEdgeIndex(-1);
    setNodes((prev) => prev.map((n) => ({ ...n, status: "idle" })));
  };

  const resetCanvasView = () => {
    setPan({ x: 30, y: 40 });
    setScale(0.95);
  };

  const getNodeIcon = (type: CoreNodeType) => {
    switch (type) {
      case "webhook_trigger":
        return <Globe className="h-4 w-4 text-[#7FBF6A]" />;
      case "cron_trigger":
        return <Clock className="h-4 w-4 text-[#75d555]" />;
      case "transform_script":
        return <Code className={`h-4 w-4 ${isLight ? "text-cyan-700" : "text-cyan-400"}`} />;
      case "http_request":
        return <Send className={`h-4 w-4 ${isLight ? "text-teal-700" : "text-emerald-300"}`} />;
      case "delay_timer":
        return <Hourglass className={`h-4 w-4 ${isLight ? "text-amber-700" : "text-amber-300"}`} />;
    }
  };

  const connectingSourceNode = nodes.find((n) => n.id === connectingFromId);

  const isLight = theme === "light";

  return (
    <div
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden select-none transition-colors duration-300 ${
        isLight ? "bg-[#F7F8F7]" : "bg-[#0C100D]"
      } ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      onMouseDown={handleCanvasMouseDown}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      style={{
        backgroundImage: isLight
          ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpolygon points='12,9.75 14.25,12 12,14.25 9.75,12' fill='rgba(127,191,106,0.22)'/%3E%3C/svg%3E\")"
          : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpolygon points='12,9.75 14.25,12 12,14.25 9.75,12' fill='rgba(117,213,85,0.22)'/%3E%3C/svg%3E\")",
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* ── Toast Notification Banner ── */}
      {toastMessage && (
        <div
          className={`canvas-control pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-mono font-medium shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150 ${
            isLight
              ? "border-[#E2E6E3] bg-[#FAFAF9]/95 text-[#111814]"
              : "border-[#7FBF6A]/50 bg-[#141A15]/95 text-[#E8ECE4]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-[#7FBF6A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Active Wiring Instruction Banner ── */}
      {connectingFromId && connectingSourceNode && (
        <div
          className={`canvas-control pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border px-5 py-2.5 text-xs font-mono shadow-xl backdrop-blur-md ${
            isLight
              ? "border-cyan-600/30 bg-[#FAFAF9]/95 text-cyan-950"
              : "border-cyan-500/50 bg-[#0F171A]/95 text-[#E8ECE4]"
          }`}
        >
          <div className="flex h-2 w-2 rounded-full bg-cyan-500 animate-ping" />
          <span>
            Wiring from <strong className={isLight ? "text-cyan-700 font-bold" : "text-cyan-300"}>{connectingSourceNode.name}</strong> → click input dot on target card
          </span>
          <button
            onClick={() => setConnectingFromId(null)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
              isLight
                ? "border-[#D1D9D0] bg-[#F4F6F2] text-[#5E695E] hover:text-[#141A15]"
                : "border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-white"
            }`}
          >
            <X className="h-3 w-3" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* ── Main Canvas World Transform Layer ── */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        {/* SVG Bezier Connection Lines */}
        <svg className="absolute inset-0 w-[4000px] h-[4000px] overflow-visible pointer-events-none z-0">
          <defs>
            <filter id="n8nGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="activeLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7FBF6A" />
              <stop offset="50%" stopColor="#75d555" />
              <stop offset="100%" stopColor="#92CF7D" />
            </linearGradient>
          </defs>

          {connections.map((conn, idx) => {
            const source = nodes.find((n) => n.id === conn.from);
            const target = nodes.find((n) => n.id === conn.to);
            if (!source || !target) return null;

            // Output port: right center of header (240px card, 24px from top)
            const sx = source.x + 240;
            const sy = source.y + 24;
            // Input port: left center of header
            const tx = target.x;
            const ty = target.y + 24;

            const dx = Math.max(50, Math.abs(tx - sx) * 0.45);
            const pathData = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
            const isActive = isRunning && (activeEdgeIndex === idx || source.status === "running");

            const isCycleEdge =
              dagValidation.cyclePath &&
              dagValidation.cyclePath.includes(conn.from) &&
              dagValidation.cyclePath.includes(conn.to);

            return (
              <g key={`${conn.from}-${conn.to}-${idx}`} className="group pointer-events-auto">
                <path
                  d={pathData}
                  stroke="transparent"
                  strokeWidth="14"
                  fill="none"
                  className="cursor-pointer"
                  onClick={(e) => deleteConnection(idx, e)}
                />

                <path
                  d={pathData}
                  stroke={isCycleEdge ? "#EF4444" : isLight ? "#CBD5E1" : "#243026"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                  className={`transition-colors cursor-pointer ${
                    isLight ? "group-hover:stroke-rose-500" : "group-hover:stroke-rose-400"
                  }`}
                  onClick={(e) => deleteConnection(idx, e)}
                />

                {isActive && (
                  <>
                    <path
                      d={pathData}
                      stroke="url(#activeLineGrad)"
                      strokeWidth="2.5"
                      strokeDasharray="6 8"
                      strokeLinecap="round"
                      fill="none"
                      filter="url(#n8nGlow)"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="28"
                        to="0"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    </path>
                    <circle r="4" fill={isLight ? "#7FBF6A" : "#E8ECE4"} filter="url(#n8nGlow)">
                      <animateMotion path={pathData} dur="0.9s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}
              </g>
            );
          })}

          {/* Interactive rubber-band wire when connecting */}
          {connectingFromId && connectingSourceNode && (
            <path
              d={`M ${connectingSourceNode.x + 240} ${connectingSourceNode.y + 24} C ${
                connectingSourceNode.x + 240 + 50
              } ${connectingSourceNode.y + 24}, ${mouseCanvasPos.x - 50} ${mouseCanvasPos.y}, ${
                mouseCanvasPos.x
              } ${mouseCanvasPos.y}`}
              stroke={isLight ? "#0284C7" : "#38BDF8"}
              strokeWidth="2"
              strokeDasharray="4 4"
              fill="none"
            />
          )}
        </svg>

        {/* ── Draggable Workflow Nodes ── */}
        {nodes.map((node) => {
          const isNodeRunning = node.status === "running";
          const isNodeSuccess = node.status === "success";
          const isWiringSource = connectingFromId === node.id;
          const isSelected = selectedNodeId === node.id;
          const isAvailableTarget =
            connectingFromId !== null && connectingFromId !== node.id && node.category === "action";

          return (
            <div
              key={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              className={`studio-node absolute w-[240px] rounded-2xl border p-3 pointer-events-auto select-none cursor-move transition-all duration-150 ${
                isSelected
                  ? isLight
                    ? "border-[#7FBF6A] bg-[#FFFFFF] shadow-[0_0_24px_rgba(127,191,106,0.35)] ring-2 ring-[#7FBF6A]"
                    : "border-[#7FBF6A] bg-[#141A15] shadow-[0_0_24px_rgba(127,191,106,0.35)] ring-2 ring-[#7FBF6A]"
                  : isNodeRunning
                    ? isLight
                      ? "border-[#7FBF6A] bg-[#FFFFFF] shadow-[0_0_30px_rgba(127,191,106,0.35)] ring-1 ring-[#7FBF6A]"
                      : "border-[#7FBF6A] bg-[#141A15] shadow-[0_0_30px_rgba(127,191,106,0.35)] ring-1 ring-[#7FBF6A]"
                    : isNodeSuccess
                      ? isLight
                        ? "border-[#7FBF6A]/50 bg-[#FFFFFF] shadow-[0_4px_20px_rgba(127,191,106,0.15)]"
                        : "border-[#7FBF6A]/50 bg-[#141A15] shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                      : isWiringSource
                        ? isLight
                          ? "border-cyan-600 bg-cyan-50 shadow-[0_0_24px_rgba(6,182,212,0.3)] ring-2 ring-cyan-500/50"
                          : "border-cyan-400 bg-[#101718] shadow-[0_0_24px_rgba(56,189,248,0.3)] ring-2 ring-cyan-400/50"
                        : isLight
                          ? "border-[#E2E6E3] bg-[#FFFFFF]/98 hover:border-[#7FBF6A]/50 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.01)]"
                          : "border-[#243026] bg-[#141A15]/95 hover:border-[#7FBF6A]/40 shadow-xl"
              }`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              }}
            >
              {/* Left Input Port */}
              {node.category === "action" && (
                <div
                  onClick={(e) => handleInputPortClick(e, node.id)}
                  className={`node-port absolute -left-2 top-6 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 transition-colors cursor-pointer ${
                    isAvailableTarget
                      ? isLight
                        ? "border-cyan-600 bg-cyan-100 ring-4 ring-cyan-500/40 animate-pulse scale-125"
                        : "border-cyan-400 bg-cyan-950 ring-4 ring-cyan-400/40 animate-pulse scale-125"
                      : isLight
                        ? "border-[#E2E6E3] bg-[#F7F8F7] hover:border-[#7FBF6A]"
                        : "border-[#243026] bg-[#0C100D] hover:border-[#7FBF6A]"
                  }`}
                  title="Click to connect input"
                />
              )}

              {/* Right Output Port */}
              <div
                onClick={(e) => handleOutputPortClick(e, node.id)}
                className={`node-port absolute -right-2 top-6 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 transition-all cursor-pointer ${
                  isWiringSource
                    ? isLight
                      ? "border-cyan-600 bg-cyan-100 ring-4 ring-cyan-500/40 animate-pulse scale-125"
                      : "border-cyan-400 bg-cyan-950 ring-4 ring-cyan-400/40 animate-pulse scale-125"
                    : isLight
                      ? "border-[#7FBF6A] bg-[#F7F8F7] shadow-[0_0_8px_rgba(127,191,106,0.4)] hover:scale-125"
                      : "border-[#7FBF6A] bg-[#0C100D] shadow-[0_0_8px_rgba(127,191,106,0.5)] hover:scale-125"
                }`}
                title="Click to wire to another node"
              />

              {/* Node Card Header */}
              <div
                className={`flex items-center justify-between pb-2 mb-2 border-b ${
                  isLight ? "border-[#EFF2EE]" : "border-[#243026]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                      isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                    }`}
                  >
                    {getNodeIcon(node.type)}
                  </div>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7FBF6A]">
                    {node.badge}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {isNodeRunning ? (
                    <span className="relative flex h-2 w-2 mr-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#7FBF6A]" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7FBF6A]" />
                    </span>
                  ) : isNodeSuccess ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#7FBF6A] mr-1" />
                  ) : null}

                  {/* Settings / Inspect Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
                    }}
                    className={`p-1 rounded-md transition-colors cursor-pointer ${
                      isSelected
                        ? "text-[#7FBF6A] bg-[#7FBF6A]/15"
                        : isLight
                          ? "text-[#667268] hover:text-[#111814] hover:bg-[#F0F2F0]"
                          : "text-[#8B968B] hover:text-[#E8ECE4] hover:bg-[#243026]"
                    }`}
                    title="Inspect Node Parameters (Target URL, Retries, Jitter Backoff)"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => deleteNode(node.id, e)}
                    className={`${
                      isLight ? "text-[#667268] hover:text-rose-600" : "text-[#8B968B] hover:text-rose-400"
                    } transition-colors cursor-pointer p-1 rounded-md`}
                    title="Remove node"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Node Title & Description */}
              <div>
                <h4
                  className={`text-xs font-semibold truncate ${
                    isLight ? "text-[#111814]" : "text-[#E8ECE4]"
                  }`}
                >
                  {node.name}
                </h4>
                <p
                  className={`mt-0.5 text-[10px] font-mono truncate ${
                    isLight ? "text-[#667268]" : "text-[#8B968B]"
                  }`}
                >
                  {node.detail}
                </p>

                {/* HTTP Request specific interactive parameters */}
                {node.type === "http_request" && (
                  <div className="mt-2.5 space-y-2 pt-2 border-t border-[#243026]/70">
                    {/* Target URL */}
                    <div className="rounded-xl bg-[#0C100D]/90 p-2 border border-[#243026]">
                      <div className="flex items-center justify-between text-[8px] font-mono text-[#8B968B] mb-1">
                        <span className="font-bold tracking-wider text-[#7FBF6A]">TARGET URL</span>
                        <span className="rounded bg-[#7FBF6A]/20 px-1 py-0.2 text-[8px] font-bold text-[#7FBF6A]">
                          {node.config?.method || "POST"}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={node.config?.url || "https://api.stripe.com/v1/charges"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateNodeConfig(node.id, { url: e.target.value })}
                        className="w-full bg-transparent font-mono text-[9.5px] text-[#E8ECE4] focus:text-[#7FBF6A] outline-none truncate"
                        placeholder="https://api.domain.com/v1"
                        title="Click to edit Target Endpoint URL"
                      />
                    </div>

                    {/* Max Retries & Base Interval Steppers */}
                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[9px]">
                      {/* Max Retries */}
                      <div className="rounded-xl bg-[#0C100D]/90 p-1.5 border border-[#243026]">
                        <div className="text-[7.5px] uppercase font-bold text-[#8B968B]">Max Retries</div>
                        <div className="flex items-center justify-between mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateNodeConfig(node.id, {
                                maxRetries: Math.max(0, (node.config?.maxRetries ?? 3) - 1),
                              });
                            }}
                            className="h-4 w-4 rounded bg-[#243026] hover:bg-[#7FBF6A] hover:text-[#0C100D] text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer select-none"
                            title="Decrease Max Retries"
                          >
                            -
                          </button>
                          <span className="font-bold text-[#7FBF6A] text-[10px]">
                            {node.config?.maxRetries ?? 3}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateNodeConfig(node.id, {
                                maxRetries: Math.min(10, (node.config?.maxRetries ?? 3) + 1),
                              });
                            }}
                            className="h-4 w-4 rounded bg-[#243026] hover:bg-[#7FBF6A] hover:text-[#0C100D] text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer select-none"
                            title="Increase Max Retries"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Base Interval */}
                      <div className="rounded-xl bg-[#0C100D]/90 p-1.5 border border-[#243026]">
                        <div className="text-[7.5px] uppercase font-bold text-[#8B968B]">Base Interval</div>
                        <div className="flex items-center justify-between mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateNodeConfig(node.id, {
                                baseBackoffMs: Math.max(100, (node.config?.baseBackoffMs ?? 1000) - 250),
                              });
                            }}
                            className="h-4 w-4 rounded bg-[#243026] hover:bg-[#7FBF6A] hover:text-[#0C100D] text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer select-none"
                            title="Decrease Base Interval"
                          >
                            -
                          </button>
                          <span className="font-bold text-[#7FBF6A] text-[10px]">
                            {node.config?.baseBackoffMs ?? 1000}ms
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateNodeConfig(node.id, {
                                baseBackoffMs: (node.config?.baseBackoffMs ?? 1000) + 250,
                              });
                            }}
                            className="h-4 w-4 rounded bg-[#243026] hover:bg-[#7FBF6A] hover:text-[#0C100D] text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer select-none"
                            title="Increase Base Interval"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* T3.3 Full Jitter & T3.4 DLQ Badges */}
                    <div className="flex items-center justify-between pt-0.5 text-[8px] font-mono">
                      <span className="text-[#7FBF6A] font-semibold flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5" /> Full Jitter
                      </span>
                      <span className="text-[#E5735C] font-semibold flex items-center gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> DLQ Routing
                      </span>
                    </div>

                    {/* Open Inspector Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#7FBF6A]/30 bg-[#7FBF6A]/10 py-1 text-[9px] font-mono font-bold text-[#7FBF6A] hover:bg-[#7FBF6A]/20 transition-all cursor-pointer"
                    >
                      <Settings2 className="h-3 w-3" />
                      <span>Configure Parameters & Formula</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Top Left: Execute & Reset Workflow Toolbar (In place of Dormammu Engine Canvas) ── */}
      <div
        className={`canvas-control pointer-events-auto absolute top-24 left-6 z-40 flex items-center gap-2 rounded-xl border p-1.5 backdrop-blur-md ${
          isLight
            ? "border-[#E2E6E3] bg-[#FAFAF9]/95 shadow-[0_10px_30px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,1)]"
            : "border-[#243026] bg-[#141A15]/90 shadow-2xl"
        }`}
      >
        <button
          onClick={resetWorkflow}
          type="button"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer select-none active:scale-95 ${
            isLight
              ? "border-[#E2E6E3] bg-[#F0F2F0] text-[#667268] hover:text-[#111814] hover:border-[#7FBF6A]/50"
              : "border-[#243026] bg-[#0C100D] text-[#8B968B] hover:text-[#E8ECE4] hover:border-[#7FBF6A]/40"
          }`}
          title="Reset Node State"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>

        <button
          onClick={runWorkflow}
          disabled={isRunning || !dagValidation.isValid}
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-[#7FBF6A] bg-[#7FBF6A] hover:bg-[#92CF7D] text-[#0C100D] shadow-[0_0_15px_rgba(127,191,106,0.3)] px-4 py-1.5 text-xs font-mono font-bold transition-all cursor-pointer select-none active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Simulate DAG Execution"
        >
          <Play className={`h-3.5 w-3.5 fill-current ${isRunning ? "animate-pulse" : ""}`} />
          <span>{isRunning ? "Executing..." : "Execute Workflow"}</span>
        </button>

        <div className={`h-4 w-[1px] ${isLight ? "bg-[#E2E6E3]" : "bg-[#243026]"}`} />

        {/* Node Parameter Inspector Quick Toggle */}
        <button
          onClick={() => setSelectedNodeId(selectedNodeId === "http_1" ? null : "http_1")}
          type="button"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer select-none active:scale-95 ${
            selectedNodeId === "http_1"
              ? "border-[#7FBF6A] bg-[#7FBF6A]/20 text-[#7FBF6A] shadow-[0_0_12px_rgba(127,191,106,0.25)]"
              : isLight
                ? "border-[#E2E6E3] bg-[#F0F2F0] text-[#667268] hover:text-[#111814]"
                : "border-[#243026] bg-[#0C100D] text-[#8B968B] hover:text-[#E8ECE4]"
          }`}
          title="Toggle Node Configuration Inspector (Target URL, Retries, Jitter Backoff)"
        >
          <Settings2 className="h-3.5 w-3.5 text-[#7FBF6A]" />
          <span>
            {selectedNodeId === "http_1" ? "Hide Inspector" : "Node Inspector"} (Retries:{" "}
            {nodes.find((n) => n.id === "http_1")?.config?.maxRetries ?? 3} | Base:{" "}
            {nodes.find((n) => n.id === "http_1")?.config?.baseBackoffMs ?? 1000}ms)
          </span>
        </button>
      </div>

      {/* ── Bottom Right: Zoom & Center Controls ── */}
      <div
        className={`canvas-control pointer-events-auto absolute bottom-6 right-6 z-20 flex items-center gap-1 rounded-xl border p-1 backdrop-blur-md ${
          isLight
            ? "border-[#E2E6E3] bg-[#FAFAF9]/95 shadow-[0_10px_30px_rgba(0,0,0,0.06)] text-[#667268]"
            : "border-[#243026] bg-[#141A15]/90 shadow-2xl text-[#8B968B]"
        }`}
      >
        <button
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          type="button"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isLight ? "hover:text-[#7FBF6A] hover:bg-[#F0F2F0]" : "hover:text-[#7FBF6A] hover:bg-[#243026]"
          }`}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
          type="button"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isLight ? "hover:text-[#7FBF6A] hover:bg-[#F0F2F0]" : "hover:text-[#7FBF6A] hover:bg-[#243026]"
          }`}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className={`h-4 w-px mx-0.5 ${isLight ? "bg-[#E2E6E3]" : "bg-[#243026]"}`} />
        <button
          onClick={resetCanvasView}
          type="button"
          className={`flex items-center gap-1 px-2 h-8 rounded-lg text-[10px] font-mono transition-colors cursor-pointer ${
            isLight ? "hover:text-[#7FBF6A] hover:bg-[#F0F2F0]" : "hover:text-[#7FBF6A] hover:bg-[#243026]"
          }`}
          title="Center Canvas"
        >
          <Maximize2 className="h-3 w-3" />
          <span>{Math.round(scale * 100)}%</span>
        </button>
      </div>

      {/* ── Bottom Left: Dormammu Engine Canvas Status Card ── */}
      <div
        className={`canvas-control pointer-events-auto absolute bottom-6 left-6 z-20 flex items-center gap-3 rounded-xl border px-3.5 py-2.5 backdrop-blur-md ${
          isLight
            ? "border-[#E2E6E3] bg-[#FAFAF9]/95 shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
            : "border-[#243026] bg-[#141A15]/90 shadow-2xl"
        }`}
      >
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            dagValidation.isValid
              ? "bg-[#7FBF6A]/10 text-[#7FBF6A]"
              : "bg-rose-500/10 text-rose-500"
          }`}
        >
          {dagValidation.isValid ? <Layers className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold ${isLight ? "text-[#111814]" : "text-[#E8ECE4]"}`}
            >
              Dormammu Engine Canvas
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                dagValidation.isValid
                  ? "bg-[#7FBF6A]/15 text-[#7FBF6A]"
                  : "bg-rose-500/20 text-rose-500"
              }`}
            >
              {dagValidation.isValid ? "ACYCLIC" : "CYCLE DETECTED"}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 text-[10px] font-mono mt-0.5 ${
              isLight ? "text-[#667268]" : "text-[#8B968B]"
            }`}
          >
            <span>{nodes.length} Nodes • {connections.length} Wires</span>
            <span className={isLight ? "text-[#E2E6E3]" : "text-[#243026]"}>•</span>
            <span className="hidden sm:inline">Wire right dot → left dot</span>
          </div>
        </div>
      </div>

      {/* ── Bottom Center: Drop-Up Desk Toggle Button ── */}
      <div className="canvas-control pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          type="button"
          className={`flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-xs font-mono font-semibold transition-all cursor-pointer select-none active:scale-95 group backdrop-blur-xl ${
            isLight
              ? "border-[#7FBF6A]/40 bg-[#FAFAF9]/95 text-[#111814] hover:bg-[#F0F2F0] hover:border-[#7FBF6A] shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_20px_rgba(127,191,106,0.15)]"
              : "border-[#7FBF6A]/50 bg-[#141A15]/95 text-[#E8ECE4] hover:text-white hover:border-[#7FBF6A] hover:bg-[#1A221C] shadow-[0_4px_24px_rgba(0,0,0,0.8),0_0_20px_rgba(127,191,106,0.25)]"
          }`}
        >
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full group-hover:scale-110 transition-transform ${
              isLight ? "bg-[#7FBF6A]/15 text-[#7FBF6A]" : "bg-[#7FBF6A]/20 text-[#7FBF6A]"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
          </div>
          <span>Node Desk (5 Cards)</span>
          <ChevronUp
            className={`h-4 w-4 transition-transform duration-300 text-[#7FBF6A] ${
              isDrawerOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* ── Sliding Bottom Desk (Draggable 5 Core Cards) ── */}
      <div
        className={`canvas-control pointer-events-auto absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${
          isDrawerOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className={`mx-auto max-w-6xl rounded-t-3xl border-t border-x p-5 backdrop-blur-2xl ${
            isLight
              ? "border-[#E2E6E3] bg-[#FAFAF9]/98 shadow-[0_-12px_45px_rgba(0,0,0,0.08)]"
              : "border-[#243026] bg-[#0E1310]/98 shadow-[0_-12px_45px_rgba(0,0,0,0.9)]"
          }`}
        >
          {/* Desk Header */}
          <div
            className={`flex items-center justify-between pb-3 mb-4 border-b ${
              isLight ? "border-[#EFF2EE]" : "border-[#243026]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#7FBF6A]/30 bg-[#7FBF6A]/10 text-[#7FBF6A]">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h3
                  className={`text-sm font-bold ${isLight ? "text-[#111814]" : "text-[#E8ECE4]"}`}
                >
                  ChronoGraph Node Desk — 5 Core Cards
                </h3>
                <p
                  className={`text-[11px] font-mono ${isLight ? "text-[#667268]" : "text-[#8B968B]"}`}
                >
                  Drag any card onto the canvas or click to add • Connect right dot → left dot to join
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsDrawerOpen(false)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                isLight
                  ? "border-[#E2E6E3] bg-[#F0F2F0] text-[#667268] hover:text-[#111814] hover:border-[#7FBF6A]/40"
                  : "border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#E8ECE4] hover:border-[#7FBF6A]/40"
              }`}
              title="Close Desk"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* 5 Core Cards with HTML5 Drag & Drop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {CORE_NODE_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/chronograph-node-type", tmpl.type);
                  e.dataTransfer.setData("text/plain", tmpl.type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addNodeToCanvas(tmpl)}
                className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 transition-all duration-150 cursor-grab active:cursor-grabbing active:scale-95 ${
                  isLight
                    ? "border-[#E2E6E3] bg-[#FFFFFF]/90 hover:border-[#7FBF6A] hover:bg-[#FFFFFF] shadow-sm hover:shadow-md"
                    : "border-[#243026] bg-[#141A15]/95 hover:border-[#7FBF6A] hover:bg-[#1A221C] shadow-lg hover:shadow-[0_8px_25px_rgba(0,0,0,0.6)]"
                }`}
              >
                <div>
                  <div
                    className={`flex items-center justify-between pb-2 mb-2 border-b ${
                      isLight ? "border-[#EFF2EE]" : "border-[#243026]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                          isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                        }`}
                      >
                        {getNodeIcon(tmpl.type)}
                      </div>
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7FBF6A]">
                        {tmpl.badge}
                      </span>
                    </div>

                    <span className="flex items-center gap-1 font-mono text-[9px] font-bold group-hover:translate-x-0.5 transition-transform text-[#7FBF6A]">
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </span>
                  </div>

                  <h4
                    className={`text-xs font-semibold group-hover:text-[#7FBF6A] transition-colors truncate ${
                      isLight ? "text-[#111814]" : "text-[#E8ECE4]"
                    }`}
                  >
                    {tmpl.name}
                  </h4>
                  <p
                    className={`mt-0.5 text-[10px] font-mono truncate ${
                      isLight ? "text-[#667268]" : "text-[#8B968B]"
                    }`}
                  >
                    {tmpl.detail}
                  </p>
                  <p
                    className={`mt-1 text-[10px] line-clamp-2 leading-relaxed ${
                      isLight ? "text-[#667268]/80" : "text-[#8B968B]/70"
                    }`}
                  >
                    {tmpl.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Floating Node Inspector Button when Drawer Closed ── */}
      {!selectedNode && (
        <button
          onClick={() => setSelectedNodeId("http_1")}
          className={`canvas-control pointer-events-auto fixed top-20 right-6 z-40 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all cursor-pointer select-none hover:scale-105 active:scale-95 ${
            isLight
              ? "border-[#7FBF6A]/50 bg-white/95 text-[#111814] shadow-[0_10px_30px_rgba(0,0,0,0.1)]"
              : "border-[#7FBF6A]/50 bg-[#141A15]/95 text-[#E8ECE4] shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
          }`}
          title="Open Node Configuration Inspector (Target URL, Retries, Jitter Backoff)"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#7FBF6A]/20 text-[#7FBF6A]">
            <Settings2 className="h-4 w-4" />
          </div>
          <div className="text-left font-mono">
            <div className="text-[11px] font-bold text-[#7FBF6A] flex items-center gap-1">
              <span>Node Parameters</span>
              <span className="rounded bg-[#7FBF6A]/20 px-1 text-[8px]">T3.3/T3.4</span>
            </div>
            <div className="text-[9px] text-[#8B968B]">HTTP: Retries & Base Interval</div>
          </div>
        </button>
      )}

      {/* ── Right: Node Configuration Inspector Drawer (T5.4 & T3.3/T3.4 Visualizer) ── */}
      {selectedNode && (
        <div
          className={`canvas-control pointer-events-auto fixed top-20 right-6 z-50 w-[420px] max-h-[calc(100vh-120px)] overflow-y-auto rounded-3xl border p-5 shadow-2xl backdrop-blur-2xl ring-1 ring-[#7FBF6A]/30 animate-in fade-in slide-in-from-right-4 duration-150 ${
            isLight
              ? "border-[#E2E6E3] bg-[#FFFFFF]/98 text-[#111814] shadow-[0_20px_50px_rgba(0,0,0,0.15)]"
              : "border-[#243026] bg-[#141A15]/98 text-[#E8ECE4] shadow-[0_25px_60px_rgba(0,0,0,0.9)]"
          }`}
          style={{
            scrollbarWidth: "thin",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
                  isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                }`}
              >
                {getNodeIcon(selectedNode.type)}
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">{selectedNode.name}</h3>
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7FBF6A]">
                  {selectedNode.badge} • CONFIG
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedNodeId(null)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLight
                  ? "border-[#E2E6E3] text-[#667268] hover:text-[#111814] hover:bg-[#F0F2F0]"
                  : "border-[#243026] text-[#8B968B] hover:text-[#E8ECE4] hover:bg-[#1A221C]"
              }`}
              title="Close Inspector"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form Content */}
          <div className="space-y-4 text-xs">
            {selectedNode.type === "http_request" && (
              <>
                {/* Target URL */}
                <div>
                  <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                    Target Endpoint URL
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedNode.config?.method || "POST"}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { method: e.target.value })}
                      className={`rounded-xl border px-2.5 py-2 font-mono text-xs font-bold ${
                        isLight
                          ? "border-[#E2E6E3] bg-[#F7F8F7] text-[#111814]"
                          : "border-[#243026] bg-[#0C100D] text-[#7FBF6A]"
                      }`}
                    >
                      <option>POST</option>
                      <option>GET</option>
                      <option>PUT</option>
                      <option>DELETE</option>
                    </select>
                    <input
                      type="text"
                      value={selectedNode.config?.url || "https://api.stripe.com/v1/charges"}
                      onChange={(e) => updateNodeConfig(selectedNode.id, { url: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className={`flex-1 rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] transition-colors ${
                        isLight
                          ? "border-[#E2E6E3] bg-[#F7F8F7] text-[#111814]"
                          : "border-[#243026] bg-[#0C100D] text-[#E8ECE4]"
                      }`}
                    />
                  </div>
                </div>

                {/* Retry Cap & Base Interval (T3.3) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                      Max Retries (0-10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={selectedNode.config?.maxRetries ?? 3}
                      onChange={(e) =>
                        updateNodeConfig(selectedNode.id, {
                          maxRetries: Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)),
                        })
                      }
                      className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] transition-colors ${
                        isLight
                          ? "border-[#E2E6E3] bg-[#F7F8F7] text-[#111814]"
                          : "border-[#243026] bg-[#0C100D] text-[#E8ECE4]"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                      Base Interval (ms)
                    </label>
                    <input
                      type="number"
                      step={100}
                      value={selectedNode.config?.baseBackoffMs ?? 1000}
                      onChange={(e) =>
                        updateNodeConfig(selectedNode.id, {
                          baseBackoffMs: Math.max(100, parseInt(e.target.value, 10) || 1000),
                        })
                      }
                      className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] transition-colors ${
                        isLight
                          ? "border-[#E2E6E3] bg-[#F7F8F7] text-[#111814]"
                          : "border-[#243026] bg-[#0C100D] text-[#E8ECE4]"
                      }`}
                    />
                  </div>
                </div>

                {/* Max Backoff Cap */}
                <div>
                  <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                    Max Backoff Cap (ms)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={selectedNode.config?.maxBackoffCapMs ?? 30000}
                    onChange={(e) =>
                      updateNodeConfig(selectedNode.id, {
                        maxBackoffCapMs: Math.max(1000, parseInt(e.target.value, 10) || 30000),
                      })
                    }
                    className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] transition-colors ${
                      isLight
                        ? "border-[#E2E6E3] bg-[#F7F8F7] text-[#111814]"
                        : "border-[#243026] bg-[#0C100D] text-[#E8ECE4]"
                    }`}
                  />
                </div>

                {/* T3.3 Full Jitter Strategy Callout */}
                <div
                  className={`rounded-2xl border p-3 font-mono text-[11px] ${
                    isLight ? "border-[#7FBF6A]/30 bg-[#7FBF6A]/10" : "border-[#7FBF6A]/30 bg-[#0C100D]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[#7FBF6A] font-bold mb-1">
                    <Zap className="h-3.5 w-3.5" />
                    <span>T3.3 BullMQ Backoff Strategy</span>
                  </div>
                  <p className="text-[10px] text-[#8B968B] leading-relaxed">
                    Math.floor(random() × min(cap, base × 2^attempt))
                  </p>
                  <div className="mt-2 text-[10px] text-[#7FBF6A] font-bold">
                    ✓ Full Jitter Enabled (Prevents downstream DDoS)
                  </div>
                </div>

                {/* T3.4 DLQ Routing Callout */}
                <div
                  className={`rounded-2xl border p-3 font-mono text-[11px] ${
                    isLight ? "border-[#E5735C]/30 bg-[#E5735C]/10" : "border-[#E5735C]/30 bg-[#0C100D]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[#E5735C] font-bold mb-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>T3.4 Dead-Letter Queue (DLQ)</span>
                  </div>
                  <p className="text-[10px] text-[#8B968B] leading-relaxed">
                    If attempts ≥ {selectedNode.config?.maxRetries ?? 3}, job routes to DLQ, persists failure context to PostgreSQL, and halts downstream dependent nodes.
                  </p>
                </div>
              </>
            )}

            {/* Other node types: webhook, cron, transform, delay */}
            {selectedNode.type === "webhook_trigger" && (
              <div>
                <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                  Webhook Ingestion Path
                </label>
                <input
                  type="text"
                  value={selectedNode.config?.url || "/api/v1/hooks/orders_settle"}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { url: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] ${
                    isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                  }`}
                />
                <p className="mt-1 text-[10px] text-[#8B968B]">HMAC-SHA256 signature verification enforced.</p>
              </div>
            )}

            {selectedNode.type === "cron_trigger" && (
              <div>
                <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                  Cron Expression (5-Field)
                </label>
                <input
                  type="text"
                  value={selectedNode.config?.cronExpression || "0 * * * *"}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { cronExpression: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] ${
                    isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                  }`}
                />
                <p className="mt-1 text-[10px] text-[#8B968B]">BullMQ repeatable job scheduler integration.</p>
              </div>
            )}

            {selectedNode.type === "delay_timer" && (
              <div>
                <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                  Sleep Duration (ms)
                </label>
                <input
                  type="number"
                  step={500}
                  value={selectedNode.config?.delayMs ?? 5000}
                  onChange={(e) =>
                    updateNodeConfig(selectedNode.id, { delayMs: parseInt(e.target.value, 10) || 5000 })
                  }
                  className={`w-full rounded-xl border px-3 py-2 font-mono text-xs outline-none focus:border-[#7FBF6A] ${
                    isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                  }`}
                />
                <p className="mt-1 text-[10px] text-[#8B968B]">Non-blocking BullMQ ZSET delayed transition.</p>
              </div>
            )}

            {selectedNode.type === "transform_script" && (
              <div>
                <label className="block text-[11px] font-mono font-semibold text-[#8B968B] mb-1.5">
                  JSON Path / Mapping Expression
                </label>
                <textarea
                  rows={3}
                  value={selectedNode.config?.script || "payload.items.map(i => i.id)"}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { script: e.target.value })}
                  className={`w-full rounded-xl border p-3 font-mono text-xs outline-none focus:border-[#7FBF6A] ${
                    isLight ? "border-[#E2E6E3] bg-[#F7F8F7]" : "border-[#243026] bg-[#0C100D]"
                  }`}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
