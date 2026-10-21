"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Rotate3d,
  Terminal,
  Activity,
  Cpu,
  CheckCircle2,
  Zap,
  ArrowRight,
  Workflow,
  Radio,
} from "lucide-react";

interface WorkflowVisualizer3DProps {
  className?: string;
}

export function WorkflowVisualizer3D({ className = "" }: WorkflowVisualizer3DProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Auto-stepping node execution simulation on back face
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 5);
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  const toggleFlip = () => setIsFlipped((prev) => !prev);

  return (
    <div
      className={`relative w-full ${className}`}
      style={{ perspective: 1200 }}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative w-full min-h-[440px]"
      >
        {/* ══════════════════════════════════════════════════════════════
            FRONT FACE: 3D Pipeline Architecture DAG SVG
            ══════════════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl border border-[#243026] bg-[#141A15] p-4 sm:p-5 shadow-2xl relative w-full h-full flex flex-col justify-between"
          style={{
            transform: "rotateY(0deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: isFlipped ? 1 : 2,
            opacity: isFlipped ? 0 : 1,
            pointerEvents: isFlipped ? "none" : "auto",
            transition: "opacity 0.25s ease",
            boxShadow:
              "0 25px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Top Bar with Live Indicator & Prominent Flip Button */}
          <div className="relative z-10 flex items-center justify-between pb-3 mb-3 border-b border-[#243026]/80 text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7FBF6A] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7FBF6A]" />
              </span>
              <span className="text-[#8B968B] font-medium">PIPELINE:</span>
              <span className="text-[#7FBF6A] font-semibold">order_settlement_dag.v3</span>
            </div>

            <button
              onClick={toggleFlip}
              type="button"
              className="flex items-center gap-2 rounded-xl border border-[#7FBF6A] bg-[#7FBF6A]/15 px-3 py-1.5 text-xs font-mono font-bold text-[#7FBF6A] hover:bg-[#7FBF6A] hover:text-[#0C100D] transition-all cursor-pointer select-none active:scale-95 shadow-[0_0_12px_rgba(127,191,106,0.25)]"
              title="Click to 3D Flip to Live Execution View"
            >
              <Rotate3d className="h-4 w-4" />
              <span>3D FLIP TO EXECUTION</span>
            </button>
          </div>

          {/* Responsive Animated SVG Diagram */}
          <div className="relative z-10 my-auto cursor-pointer" onClick={toggleFlip} title="Click anywhere to 3D flip">
            <svg
              viewBox="0 0 760 210"
              className="w-full h-auto select-none"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <filter id="greenGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#19221B" />
                  <stop offset="100%" stopColor="#101511" />
                </linearGradient>
                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1E2B20" />
                  <stop offset="100%" stopColor="#141C15" />
                </linearGradient>
              </defs>

              {/* Base connection curves */}
              <path d="M 140 105 C 185 105, 185 55, 230 55" stroke="#243026" strokeWidth="2" strokeLinecap="round" />
              <path d="M 140 105 C 185 105, 185 155, 230 155" stroke="#243026" strokeWidth="2" strokeLinecap="round" />
              <path d="M 365 55 C 410 55, 410 105, 455 105" stroke="#243026" strokeWidth="2" strokeLinecap="round" />
              <path d="M 365 155 C 410 155, 410 105, 455 105" stroke="#243026" strokeWidth="2" strokeLinecap="round" />
              <path d="M 590 105 L 640 105" stroke="#243026" strokeWidth="2" strokeLinecap="round" />

              {/* Animated flow lines */}
              <path d="M 140 105 C 185 105, 185 55, 230 55" stroke="#7FBF6A" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
              </path>
              <path d="M 140 105 C 185 105, 185 155, 230 155" stroke="#7FBF6A" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
              </path>
              <path d="M 365 55 C 410 55, 410 105, 455 105" stroke="#7FBF6A" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
              </path>
              <path d="M 365 155 C 410 155, 410 105, 455 105" stroke="#7FBF6A" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
              </path>
              <path d="M 590 105 L 640 105" stroke="#7FBF6A" strokeWidth="2" strokeDasharray="6 8" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.4s" repeatCount="indefinite" />
              </path>

              {/* Animated moving packet particles */}
              <circle r="4" fill="#92CF7D" filter="url(#greenGlow)">
                <animateMotion path="M 140 105 C 185 105, 185 55, 230 55" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle r="4" fill="#7FBF6A" filter="url(#greenGlow)">
                <animateMotion path="M 140 105 C 185 105, 185 155, 230 155" dur="2s" repeatCount="indefinite" begin="0.3s" />
              </circle>
              <circle r="4" fill="#7FBF6A" filter="url(#greenGlow)">
                <animateMotion path="M 365 55 C 410 55, 410 105, 455 105" dur="1.8s" repeatCount="indefinite" begin="1s" />
              </circle>
              <circle r="4" fill="#92CF7D" filter="url(#greenGlow)">
                <animateMotion path="M 365 155 C 410 155, 410 105, 455 105" dur="1.8s" repeatCount="indefinite" begin="1s" />
              </circle>
              <circle r="4.5" fill="#E8ECE4" filter="url(#greenGlow)">
                <animateMotion path="M 590 105 L 640 105" dur="1.2s" repeatCount="indefinite" begin="1.8s" />
              </circle>

              {/* Node 1: Ingest Trigger */}
              <g transform="translate(20, 76)">
                <rect width="120" height="58" rx="10" fill="url(#nodeGrad)" stroke="#243026" strokeWidth="1.5" />
                <circle cx="16" cy="18" r="4" fill="#7FBF6A" />
                <text x="26" y="21" fill="#7FBF6A" fontSize="9.5" fontFamily="monospace" fontWeight="600" letterSpacing="0.08em">TRIGGER</text>
                <text x="14" y="38" fill="#E8ECE4" fontSize="11" fontWeight="600" fontFamily="sans-serif">POST /ingest</text>
                <text x="14" y="49" fill="#8B968B" fontSize="8.5" fontFamily="monospace">Latency: 2.1ms</text>
              </g>

              {/* Node 2: Cycle Guard (DFS) */}
              <g transform="translate(230, 26)">
                <rect width="135" height="58" rx="10" fill="url(#activeGrad)" stroke="#7FBF6A" strokeWidth="1.5" filter="url(#greenGlow)" />
                <circle cx="16" cy="18" r="4" fill="#7FBF6A" />
                <text x="26" y="21" fill="#7FBF6A" fontSize="9.5" fontFamily="monospace" fontWeight="600" letterSpacing="0.08em">CYCLE GUARD</text>
                <text x="14" y="38" fill="#E8ECE4" fontSize="11" fontWeight="600" fontFamily="sans-serif">Kahn 3-Color DFS</text>
                <text x="14" y="49" fill="#8B968B" fontSize="8.5" fontFamily="monospace">Acyclic: 0 cycles</text>
              </g>

              {/* Node 3: Temporal Lua Mutex */}
              <g transform="translate(230, 126)">
                <rect width="135" height="58" rx="10" fill="url(#nodeGrad)" stroke="#243026" strokeWidth="1.5" />
                <circle cx="16" cy="18" r="4" fill="#7FBF6A" />
                <text x="26" y="21" fill="#7FBF6A" fontSize="9.5" fontFamily="monospace" fontWeight="600" letterSpacing="0.08em">REDIS LUA</text>
                <text x="14" y="38" fill="#E8ECE4" fontSize="11" fontWeight="600" fontFamily="sans-serif">SET NX Mutex</text>
                <text x="14" y="49" fill="#8B968B" fontSize="8.5" fontFamily="monospace">TTL: 250ms</text>
              </g>

              {/* Node 4: BullMQ Workers */}
              <g transform="translate(455, 76)">
                <rect width="135" height="58" rx="10" fill="url(#nodeGrad)" stroke="#243026" strokeWidth="1.5" />
                <circle cx="16" cy="18" r="4" fill="#7FBF6A" />
                <text x="26" y="21" fill="#7FBF6A" fontSize="9.5" fontFamily="monospace" fontWeight="600" letterSpacing="0.08em">DISPATCH</text>
                <text x="14" y="38" fill="#E8ECE4" fontSize="11" fontWeight="600" fontFamily="sans-serif">BullMQ Workers</text>
                <text x="14" y="49" fill="#8B968B" fontSize="8.5" fontFamily="monospace">Concurrency: 20</text>
              </g>

              {/* Node 5: Event Emitted */}
              <g transform="translate(640, 76)">
                <rect width="105" height="58" rx="10" fill="url(#nodeGrad)" stroke="#243026" strokeWidth="1.5" />
                <circle cx="16" cy="18" r="4" fill="#E8ECE4" />
                <text x="26" y="21" fill="#8B968B" fontSize="9.5" fontFamily="monospace" fontWeight="600" letterSpacing="0.08em">COMPLETED</text>
                <text x="14" y="38" fill="#E8ECE4" fontSize="11" fontWeight="600" fontFamily="sans-serif">Emit Receipt</text>
                <text x="14" y="49" fill="#8B968B" fontSize="8.5" fontFamily="monospace">ACK: 200 OK</text>
              </g>
            </svg>
          </div>

          {/* Live Execution Telemetry Strip */}
          <div className="relative z-10 mt-4 pt-3 border-t border-[#243026]/60 grid grid-cols-3 gap-2 text-center font-mono">
            <div className="rounded-lg bg-[#0C100D]/70 border border-[#243026]/60 p-2">
              <span className="block text-[10px] text-[#8B968B]">THROUGHPUT</span>
              <span className="text-xs font-semibold text-[#7FBF6A]">14,200 msg/s</span>
            </div>
            <div className="rounded-lg bg-[#0C100D]/70 border border-[#243026]/60 p-2">
              <span className="block text-[10px] text-[#8B968B]">CYCLE DRIFT</span>
              <span className="text-xs font-semibold text-[#E8ECE4]">0 (Acyclic)</span>
            </div>
            <div className="rounded-lg bg-[#0C100D]/70 border border-[#243026]/60 p-2">
              <span className="block text-[10px] text-[#8B968B]">P99 LATENCY</span>
              <span className="text-xs font-semibold text-[#7FBF6A]">1.8 ms</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            BACK FACE: Live 3D Node Execution Trace & Logs
            ══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute inset-0 rounded-2xl border border-[#243026] bg-[#0E1410] p-4 sm:p-5 shadow-2xl flex flex-col justify-between"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: isFlipped ? 2 : 1,
            opacity: isFlipped ? 1 : 0,
            pointerEvents: isFlipped ? "auto" : "none",
            transition: "opacity 0.25s ease",
            boxShadow:
              "0 25px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Top Bar with Flip Back Button */}
          <div className="relative z-10 flex items-center justify-between pb-3 border-b border-[#243026]/80 text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[#7FBF6A]" />
              <span className="text-[#E8ECE4] font-medium">LIVE NODE EXECUTION TRACE</span>
              <span className="rounded bg-[#7FBF6A]/15 px-1.5 py-0.5 text-[9px] text-[#7FBF6A] font-semibold">
                ACTIVE PIPELINE
              </span>
            </div>

            <button
              onClick={toggleFlip}
              type="button"
              className="flex items-center gap-2 rounded-xl border border-[#7FBF6A] bg-[#7FBF6A]/15 px-3 py-1.5 text-xs font-mono font-bold text-[#7FBF6A] hover:bg-[#7FBF6A] hover:text-[#0C100D] transition-all cursor-pointer select-none active:scale-95 shadow-[0_0_12px_rgba(127,191,106,0.25)]"
              title="Click to 3D Flip back to Blueprint"
            >
              <Rotate3d className="h-4 w-4" />
              <span>FLIP TO BLUEPRINT</span>
            </button>
          </div>

          {/* 5-Node Animated Execution Pipeline Strip */}
          <div className="relative z-10 my-3 grid grid-cols-5 gap-1.5 sm:gap-2">
            {[
              { id: 0, title: "INGEST", desc: "POST /event", time: "0.2ms" },
              { id: 1, title: "KAHN DFS", desc: "3-Color Guard", time: "0.9ms" },
              { id: 2, title: "LUA MUTEX", desc: "SETNX token", time: "1.4ms" },
              { id: 3, title: "BULLMQ", desc: "Worker #04", time: "2.1ms" },
              { id: 4, title: "RECEIPT", desc: "ACK 200 OK", time: "2.8ms" },
            ].map((node) => {
              const isActive = activeStep === node.id;
              const isPast = activeStep > node.id;
              return (
                <div
                  key={node.id}
                  className={`relative rounded-xl border p-2 sm:p-2.5 font-mono transition-all duration-300 ${
                    isActive
                      ? "border-[#7FBF6A] bg-[#7FBF6A]/20 shadow-[0_0_15px_rgba(127,191,106,0.3)] scale-[1.03]"
                      : isPast
                      ? "border-[#243026] bg-[#141A15]/80 opacity-90"
                      : "border-[#243026]/60 bg-[#0C100D]/60 opacity-40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[9px] font-bold ${
                        isActive ? "text-[#7FBF6A]" : "text-[#8B968B]"
                      }`}
                    >
                      {node.title}
                    </span>
                    {isActive ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A] animate-ping" />
                    ) : isPast ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-[#7FBF6A]" />
                    ) : null}
                  </div>
                  <span className="block text-[10px] text-[#E8ECE4] truncate font-medium">
                    {node.desc}
                  </span>
                  <span className="block text-[8.5px] text-[#8B968B] mt-0.5">
                    {node.time}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Real-time Streaming Terminal Console */}
          <div className="relative z-10 rounded-xl border border-[#243026] bg-[#080B09] p-3 font-mono text-[10.5px] space-y-1.5 overflow-hidden">
            <div className="flex items-center justify-between text-[9px] text-[#8B968B] border-b border-[#243026]/70 pb-1.5 mb-1.5">
              <span>DAG RUNTIME DISPATCH LOGS</span>
              <span className="text-[#7FBF6A]">BUFFER HEALTH: 100%</span>
            </div>
            <div className="space-y-1 text-[10px] leading-relaxed">
              <div className="flex items-center gap-2 text-[#8B968B]">
                <span className="text-[#7FBF6A]">[+0.2ms]</span>
                <span className="text-[#E8ECE4]">✓ Ingested payload:</span>
                <span className="text-[#7FBF6A]">event_uuid: 8841-A9</span>
              </div>
              <div className="flex items-center gap-2 text-[#8B968B]">
                <span className="text-[#7FBF6A]">[+0.9ms]</span>
                <span className="text-[#E8ECE4]">↳ Kahn algorithm verified:</span>
                <span className="text-[#7FBF6A]">0 cycles detected (Acyclic)</span>
              </div>
              <div className="flex items-center gap-2 text-[#8B968B]">
                <span className="text-[#7FBF6A]">[+1.4ms]</span>
                <span className="text-[#E8ECE4]">🔒 Temporal Mutex acquired:</span>
                <span className="text-[#7FBF6A]">key: dag_mutex:402</span>
              </div>
              <div className="flex items-center gap-2 text-[#8B968B]">
                <span className="text-[#7FBF6A]">[+2.1ms]</span>
                <span className="text-[#E8ECE4]">⚡ BullMQ worker dispatch:</span>
                <span className="text-[#7FBF6A]">Worker #04 [Active]</span>
              </div>
              <div className="flex items-center gap-2 text-[#8B968B]">
                <span className="text-[#7FBF6A]">[+2.8ms]</span>
                <span className="text-[#E8ECE4]">✓ State snapshot committed:</span>
                <span className="text-[#E8ECE4]">Receipt ACK: 200 OK</span>
              </div>
            </div>
          </div>

          {/* Bottom Execution Telemetry Bar */}
          <div className="relative z-10 pt-3 border-t border-[#243026]/60 grid grid-cols-4 gap-2 text-center font-mono">
            <div className="rounded-lg bg-[#080B09] border border-[#243026]/60 p-1.5">
              <span className="block text-[8.5px] text-[#8B968B]">ENGINE FPS</span>
              <span className="text-xs font-semibold text-[#7FBF6A]">60.0 FPS</span>
            </div>
            <div className="rounded-lg bg-[#080B09] border border-[#243026]/60 p-1.5">
              <span className="block text-[8.5px] text-[#8B968B]">ACTIVE WORKERS</span>
              <span className="text-xs font-semibold text-[#E8ECE4]">20 / 20</span>
            </div>
            <div className="rounded-lg bg-[#080B09] border border-[#243026]/60 p-1.5">
              <span className="block text-[8.5px] text-[#8B968B]">HEAP USAGE</span>
              <span className="text-xs font-semibold text-[#7FBF6A]">11.4 MB</span>
            </div>
            <div className="rounded-lg bg-[#080B09] border border-[#243026]/60 p-1.5">
              <span className="block text-[8.5px] text-[#8B968B]">P99 LATENCY</span>
              <span className="text-xs font-semibold text-[#7FBF6A]">1.8 ms</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
