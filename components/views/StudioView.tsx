"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Globe,
  Shuffle,
  Clock,
  Code,
  Shield,
  Layers,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from "lucide-react";

interface WorkflowNode {
  id: string;
  name: string;
  type: "trigger" | "cycle_guard" | "mutex" | "worker" | "sink";
  status: "idle" | "running" | "success";
  detail: string;
  badge: string;
  x: number;
  y: number;
}

interface Connection {
  from: string;
  to: string;
}

const INITIAL_NODES: WorkflowNode[] = [
  {
    id: "node_1",
    name: "Webhook Ingest",
    type: "trigger",
    status: "idle",
    detail: "POST /api/v1/orders/settle",
    badge: "TRIGGER",
    x: 100,
    y: 280,
  },
  {
    id: "node_2",
    name: "Kahn Cycle Guard",
    type: "cycle_guard",
    status: "idle",
    detail: "3-Color DFS // O(V+E) Scan",
    badge: "CYCLE GUARD",
    x: 420,
    y: 170,
  },
  {
    id: "node_3",
    name: "Redis Lua Mutex",
    type: "mutex",
    status: "idle",
    detail: "SETNX key: dag:402 ttl=250ms",
    badge: "MUTEX",
    x: 420,
    y: 390,
  },
  {
    id: "node_4",
    name: "BullMQ Worker Pool",
    type: "worker",
    status: "idle",
    detail: "Worker #04 // 20 Concurrency",
    badge: "DISPATCH",
    x: 750,
    y: 280,
  },
  {
    id: "node_5",
    name: "Receipt ACK Sink",
    type: "sink",
    status: "idle",
    detail: "Emit Event // 200 OK Response",
    badge: "COMPLETED",
    x: 1080,
    y: 280,
  },
];

const CONNECTIONS: Connection[] = [
  { from: "node_1", to: "node_2" },
  { from: "node_1", to: "node_3" },
  { from: "node_2", to: "node_4" },
  { from: "node_3", to: "node_4" },
  { from: "node_4", to: "node_5" },
];

export function StudioView() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(INITIAL_NODES);
  const [isRunning, setIsRunning] = useState(false);
  const [activeEdgeIndex, setActiveEdgeIndex] = useState<number>(-1);

  // Pan & Zoom Canvas State
  const [pan, setPan] = useState({ x: 40, y: 60 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Node Dragging State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragStart = useRef({ x: 0, y: 0 });
  const nodeInitialPos = useRef({ x: 0, y: 0 });

  // Canvas Mouse Down: either drag node or pan canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking on canvas background directly
    if ((e.target as HTMLElement).closest(".studio-node") || (e.target as HTMLElement).closest(".canvas-control")) {
      return;
    }
    setIsPanning(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
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
    [isPanning, draggingNodeId, scale]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNodeId(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Node mousedown
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    nodeDragStart.current = { x: e.clientX, y: e.clientY };
    const n = nodes.find((item) => item.id === nodeId);
    if (n) {
      nodeInitialPos.current = { x: n.x, y: n.y };
    }
  };

  // Run Simulation Sequence
  const runWorkflow = () => {
    if (isRunning) return;
    setIsRunning(true);
    setNodes((prev) => prev.map((n) => ({ ...n, status: "idle" })));

    const sequence = [
      { nodeIds: ["node_1"], edgeIdx: 0, delay: 0 },
      { nodeIds: ["node_2", "node_3"], edgeIdx: 1, delay: 800 },
      { nodeIds: ["node_4"], edgeIdx: 3, delay: 1700 },
      { nodeIds: ["node_5"], edgeIdx: 4, delay: 2600 },
    ];

    sequence.forEach((step) => {
      setTimeout(() => {
        setActiveEdgeIndex(step.edgeIdx);
        setNodes((prev) =>
          prev.map((n) => {
            if (step.nodeIds.includes(n.id)) {
              return { ...n, status: "running" };
            }
            return n;
          })
        );
      }, step.delay);

      setTimeout(() => {
        setNodes((prev) =>
          prev.map((n) => {
            if (step.nodeIds.includes(n.id)) {
              return { ...n, status: "success" };
            }
            return n;
          })
        );
      }, step.delay + 700);
    });

    setTimeout(() => {
      setIsRunning(false);
      setActiveEdgeIndex(-1);
    }, 3600);
  };

  const resetWorkflow = () => {
    setIsRunning(false);
    setActiveEdgeIndex(-1);
    setNodes((prev) => prev.map((n) => ({ ...n, status: "idle" })));
  };

  const resetCanvasView = () => {
    setPan({ x: 40, y: 60 });
    setScale(1);
  };

  const getNodeIcon = (type: WorkflowNode["type"]) => {
    switch (type) {
      case "trigger":
        return <Globe className="h-4 w-4 text-[#7FBF6A]" />;
      case "cycle_guard":
        return <Shield className="h-4 w-4 text-[#75d555ff]" />;
      case "mutex":
        return <Code className="h-4 w-4 text-cyan-400" />;
      case "worker":
        return <Shuffle className="h-4 w-4 text-emerald-300" />;
      case "sink":
        return <CheckCircle2 className="h-4 w-4 text-white" />;
    }
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none bg-[#0C100D] ${
        isPanning ? "cursor-grabbing" : "cursor-grab"
      }`}
      onMouseDown={handleCanvasMouseDown}
      style={{
        // Fullscreen diamond matrix canvas grid
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpolygon points='12,9.75 14.25,12 12,14.25 9.75,12' fill='rgba(117,213,85,0.28)'/%3E%3C/svg%3E\")",
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* ── Main Canvas World Transform Layer ── */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        {/* SVG Bezier Connection Lines */}
        <svg className="absolute inset-0 w-[3000px] h-[3000px] overflow-visible pointer-events-none z-0">
          <defs>
            <filter id="n8nGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="activeLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7FBF6A" />
              <stop offset="50%" stopColor="#75d555ff" />
              <stop offset="100%" stopColor="#92CF7D" />
            </linearGradient>
          </defs>

          {CONNECTIONS.map((conn, idx) => {
            const source = nodes.find((n) => n.id === conn.from);
            const target = nodes.find((n) => n.id === conn.to);
            if (!source || !target) return null;

            // Output port: right center of source card (card width = 230, height = 96)
            const sx = source.x + 230;
            const sy = source.y + 48;
            // Input port: left center of target card
            const tx = target.x;
            const ty = target.y + 48;

            const dx = Math.max(50, Math.abs(tx - sx) * 0.45);
            const pathData = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
            const isActive = isRunning && (activeEdgeIndex === idx || source.status === "running");

            return (
              <g key={`${conn.from}-${conn.to}`}>
                {/* Base wire */}
                <path
                  d={pathData}
                  stroke="#243026"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Animated active execution pulse wire */}
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
                    {/* Animated moving packet droplet */}
                    <circle r="4" fill="#E8ECE4" filter="url(#n8nGlow)">
                      <animateMotion path={pathData} dur="0.9s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Draggable Workflow Nodes */}
        {nodes.map((node) => {
          const isNodeRunning = node.status === "running";
          const isNodeSuccess = node.status === "success";

          return (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              className={`studio-node absolute w-[230px] rounded-2xl border p-3.5 pointer-events-auto select-none transition-shadow duration-200 cursor-move ${
                isNodeRunning
                  ? "border-[#7FBF6A] bg-[#141A15] shadow-[0_0_30px_rgba(127,191,106,0.35)] ring-1 ring-[#7FBF6A]"
                  : isNodeSuccess
                  ? "border-[#7FBF6A]/50 bg-[#141A15] shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
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
              {node.type !== "trigger" && (
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-[#243026] bg-[#0C100D] hover:border-[#7FBF6A] transition-colors" />
              )}

              {/* Right Output Port */}
              {node.type !== "sink" && (
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-[#7FBF6A] bg-[#0C100D] shadow-[0_0_8px_rgba(127,191,106,0.5)]" />
              )}

              {/* Node Card Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#243026]">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#243026] bg-[#0C100D]">
                    {getNodeIcon(node.type)}
                  </div>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7FBF6A]">
                    {node.badge}
                  </span>
                </div>

                {isNodeRunning ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7FBF6A] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7FBF6A]" />
                  </span>
                ) : isNodeSuccess ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#7FBF6A]" />
                ) : null}
              </div>

              {/* Node Title & Description */}
              <div>
                <h4 className="text-xs font-semibold text-[#E8ECE4] truncate">{node.name}</h4>
                <p className="mt-0.5 text-[10px] font-mono text-[#8B968B] truncate">{node.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Floating Minimal n8n Studio UI Controls
          ══════════════════════════════════════════════════════════════ */}

      {/* Top Left: Workflow Status Bar (Under Navbar) */}
      <div className="canvas-control pointer-events-auto absolute top-20 left-6 z-20 flex items-center gap-2.5 rounded-xl border border-[#243026] bg-[#141A15]/90 px-3.5 py-2 shadow-2xl backdrop-blur-md">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#7FBF6A]/10 text-[#7FBF6A]">
          <Layers className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#E8ECE4]">Order Settlement DAG v3</span>
            <span className="rounded bg-[#7FBF6A]/15 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[#7FBF6A]">
              ACYCLIC
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#8B968B]">Kahn 3-Color DFS Guard: Active (0 cycles)</span>
        </div>
      </div>

      {/* Top Right: Execute & Reset Workflow Toolbar */}
      <div className="canvas-control pointer-events-auto absolute top-20 right-6 z-20 flex items-center gap-2 rounded-xl border border-[#243026] bg-[#141A15]/90 p-1.5 shadow-2xl backdrop-blur-md">
        <button
          onClick={resetWorkflow}
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-[#243026] bg-[#0C100D] px-3 py-1.5 text-xs font-mono font-medium text-[#8B968B] hover:text-[#E8ECE4] hover:border-[#7FBF6A]/40 transition-colors cursor-pointer select-none active:scale-95"
          title="Reset Node State"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>

        <button
          onClick={runWorkflow}
          disabled={isRunning}
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-[#7FBF6A] bg-[#7FBF6A] hover:bg-[#92CF7D] px-4 py-1.5 text-xs font-mono font-bold text-[#0C100D] transition-all cursor-pointer select-none active:scale-95 shadow-[0_0_15px_rgba(127,191,106,0.3)] disabled:opacity-50"
          title="Simulate DAG Execution"
        >
          <Play className={`h-3.5 w-3.5 fill-current ${isRunning ? "animate-pulse" : ""}`} />
          <span>{isRunning ? "Running Pipeline..." : "Execute Workflow"}</span>
        </button>
      </div>

      {/* Bottom Right: Zoom & Center Canvas Controls */}
      <div className="canvas-control pointer-events-auto absolute bottom-6 right-6 z-20 flex items-center gap-1 rounded-xl border border-[#243026] bg-[#141A15]/90 p-1 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B968B] hover:text-[#7FBF6A] hover:bg-[#243026] transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B968B] hover:text-[#7FBF6A] hover:bg-[#243026] transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="h-4 w-px bg-[#243026] mx-0.5" />
        <button
          onClick={resetCanvasView}
          type="button"
          className="flex items-center gap-1 px-2 h-8 rounded-lg text-[10px] font-mono text-[#8B968B] hover:text-[#7FBF6A] hover:bg-[#243026] transition-colors cursor-pointer"
          title="Center Canvas"
        >
          <Maximize2 className="h-3 w-3" />
          <span>{Math.round(scale * 100)}%</span>
        </button>
      </div>

      {/* Bottom Left: Hint Indicator */}
      <div className="canvas-control pointer-events-none absolute bottom-6 left-6 z-20 flex items-center gap-2 rounded-xl border border-[#243026]/70 bg-[#141A15]/80 px-3 py-1.5 text-[10px] font-mono text-[#8B968B] backdrop-blur-md">
        <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A]" />
        <span>Click & drag canvas to pan • Drag nodes to reposition</span>
      </div>
    </div>
  );
}
