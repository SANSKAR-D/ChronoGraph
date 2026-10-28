"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Workflow, LogIn, ShieldCheck, Layers, Zap, Cpu, Activity } from "lucide-react";
import { ParticleCanvas } from "@/components/ui/particle-canvas";
import { PluckedText } from "@/components/kokonutui/plucked-text";
import { StickyCard_003 } from "@/components/v1/skiper34";
import { WorkflowVisualizer3D } from "@/components/workflow/WorkflowVisualizer3D";

const FEATURE_CARDS = [
  {
    icon: <Workflow className="h-4 w-4" />,
    badge: "FEATURE 01 // VISUAL WORKFLOW STUDIO",
    title: "Interactive DAG Canvas & Zero-Cycle Guard",
    description:
      "Visually draft, wire, and simulate complex directed acyclic execution graphs with real-time Kahn topological sorting. Circular dependencies and recursive traps are terminated prior to dispatch.",
    tags: ["Topological DFS", "Kahn Algorithm", "Visual Editor", "Zero Recursion"],
    metrics: [
      { label: "Cycle Detection", value: "O(V + E) Ingest" },
      { label: "Validation Speed", value: "< 1.2 ms" },
      { label: "Canvas Frame Rate", value: "60 FPS Sync" },
    ],
    illustration: (
      <div className="w-full max-w-[260px] rounded-2xl border border-[#243026] bg-[#0C100D]/90 p-4 font-mono text-[11px] space-y-3">
        <div className="flex items-center justify-between text-[#8B968B] border-b border-[#243026] pb-2">
          <span>GRAPH // TOPOLOGY</span>
          <span className="text-[#7FBF6A]">ACYCLIC</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-[#141A15] p-2 border border-[#243026]">
            <span className="text-[#E8ECE4]">Node A: Ingest</span>
            <span className="text-[#7FBF6A]">ROOT</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#141A15] p-2 border border-[#7FBF6A]/40 text-[#7FBF6A]">
            <span>Node B: CycleGuard</span>
            <span>O(V+E)</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#141A15] p-2 border border-[#243026]">
            <span className="text-[#E8ECE4]">Node C: Dispatch</span>
            <span className="text-[#8B968B]">READY</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Zap className="h-4 w-4" />,
    badge: "FEATURE 02 // ATOMIC CONCURRENCY ENGINE",
    title: "Temporal Redis Lua Distributed Mutexes",
    description:
      "Eliminate race conditions, deadlocks, and split-brain double executions across concurrent BullMQ worker pods with microsecond non-blocking atomic Redis Lua scripts.",
    tags: ["Redis 7.2", "Lua Scripts", "SET NX Mutex", "Zero Contention"],
    metrics: [
      { label: "Lock Resolution", value: "< 0.8 ms" },
      { label: "Mutex TTL", value: "250 ms Auto-Renew" },
      { label: "Race Anomalies", value: "0 Double-Spends" },
    ],
    illustration: (
      <div className="w-full max-w-[260px] rounded-2xl border border-[#243026] bg-[#0C100D]/90 p-4 font-mono text-[11px] space-y-3">
        <div className="flex items-center justify-between text-[#8B968B] border-b border-[#243026] pb-2">
          <span>REDIS LUA // MUTEX</span>
          <span className="text-[#7FBF6A]">LOCKED</span>
        </div>
        <div className="rounded-lg bg-[#141A15] p-3 border border-[#243026] space-y-1.5">
          <span className="text-[10px] text-[#8B968B] block">KEY: pipeline:lock:order_77a</span>
          <span className="text-xs text-[#7FBF6A] font-semibold block">SET NX EX 250</span>
          <span className="text-[10px] text-[#E8ECE4] block">Atomic: 0.8ms resolution</span>
        </div>
      </div>
    ),
  },
  {
    icon: <Cpu className="h-4 w-4" />,
    badge: "FEATURE 03 // DISTRIBUTED WORKER CLUSTER",
    title: "Autonomous BullMQ Worker Pools",
    description:
      "Distribute pipeline payloads across isolated background worker pools with dynamic concurrency control, backpressure management, and sub-millisecond job scheduling.",
    tags: ["BullMQ", "Concurrency: 50+", "Dynamic Scaling", "Priority Queues"],
    metrics: [
      { label: "Cluster Throughput", value: "14,200 msg/s" },
      { label: "Active Nodes", value: "142 Worker Pods" },
      { label: "Packet Drift", value: "0.00% Zero Loss" },
    ],
    illustration: (
      <div className="w-full max-w-[260px] rounded-2xl border border-[#243026] bg-[#0C100D]/90 p-4 font-mono text-[11px] space-y-3">
        <div className="flex items-center justify-between text-[#8B968B] border-b border-[#243026] pb-2">
          <span>BULLMQ // WORKERS</span>
          <span className="text-[#7FBF6A]">ACTIVE: 20</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-[#141A15] p-2 border border-[#243026]">
            <span className="text-[10px] text-[#8B968B] block">WORKER-01</span>
            <span className="text-xs font-semibold text-[#7FBF6A]">99.8% Load</span>
          </div>
          <div className="rounded-lg bg-[#141A15] p-2 border border-[#243026]">
            <span className="text-[10px] text-[#8B968B] block">WORKER-02</span>
            <span className="text-xs font-semibold text-[#7FBF6A]">98.2% Load</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: <Layers className="h-4 w-4" />,
    badge: "FEATURE 04 // FAULT TOLERANCE & REPLAY",
    title: "Intelligent Dead-Letter Queue & Jitter Replay",
    description:
      "Isolate failing pipeline tasks with complete contextual execution stacks. Automated exponential backoff with full jitter buffers retries while enabling instant one-click pipeline state restoration.",
    tags: ["DLQ Isolation", "Full Jitter Backoff", "Stack Tracing", "One-Click Replay"],
    metrics: [
      { label: "Recovery Speed", value: "Instant (Sub-2ms)" },
      { label: "Trace Retention", value: "30 Days Deep Log" },
      { label: "Failure Resilience", value: "99.999% SLA" },
    ],
    illustration: (
      <div className="w-full max-w-[260px] rounded-2xl border border-[#243026] bg-[#0C100D]/90 p-4 font-mono text-[11px] space-y-3">
        <div className="flex items-center justify-between text-[#8B968B] border-b border-[#243026] pb-2">
          <span>DLQ BUFFER // REPLAY</span>
          <span className="text-[#E5735C]">BUFFERED</span>
        </div>
        <div className="rounded-lg bg-[#141A15] p-3 border border-[#243026] space-y-1.5">
          <span className="text-[10px] text-[#8B968B] block">BACKOFF: FULL JITTER</span>
          <span className="text-xs text-[#E8ECE4] font-semibold block">Retry in 1,240 ms</span>
          <span className="text-[10px] text-[#7FBF6A] block">Auto-replay: ARMED</span>
        </div>
      </div>
    ),
  },
  {
    icon: <Activity className="h-4 w-4" />,
    badge: "FEATURE 05 // SYSTEM OBSERVABILITY",
    title: "Streaming Topological Telemetry & Metrics",
    description:
      "Monitor live pipeline health, memory heap usage, worker heartbeats, and P99 latency percentiles with streaming real-time telemetry dashboards and instant anomaly alerting.",
    tags: ["Live Telemetry", "P99 Histograms", "Worker Heartbeat", "Zero Overhead"],
    metrics: [
      { label: "P99 Latency", value: "1.8 ms" },
      { label: "Telemetry Stream", value: "100 Hz Refresh" },
      { label: "Heap Overhead", value: "< 12 MB" },
    ],
    illustration: (
      <div className="w-full max-w-[260px] rounded-2xl border border-[#243026] bg-[#0C100D]/90 p-4 font-mono text-[11px] space-y-3">
        <div className="flex items-center justify-between text-[#8B968B] border-b border-[#243026] pb-2">
          <span>TELEMETRY // STREAM</span>
          <span className="text-[#7FBF6A]">100 HZ</span>
        </div>
        <div className="rounded-lg bg-[#141A15] p-3 border border-[#243026] space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8B968B]">P99</span>
            <span className="text-[#7FBF6A] font-semibold">1.8 ms</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8B968B]">Throughput</span>
            <span className="text-[#E8ECE4]">14.2k msg/s</span>
          </div>
        </div>
      </div>
    ),
  },
];

const START_FRAME = 42;
const END_FRAME = 177;
const TOTAL_FRAMES = END_FRAME - START_FRAME + 1;

// Card appears with scroll: starts appearing from frame 75 (p ≈ 0.244)
const CARD_START_P = (75 - START_FRAME) / (TOTAL_FRAMES - 1); // exactly frame 75
const CARD_FULL_P = CARD_START_P + 0.12; // frame ~91
const CARD_HOLD_P = 0.54;
const CARD_EXIT_P = 0.64;

function getCardMotion(p: number) {
  // slide in: starts appearing from frame 75
  if (p < CARD_START_P) return { opacity: 0, leftX: -110, rightX: 110, y: 18 };
  if (p < CARD_FULL_P) {
    const t = (p - CARD_START_P) / (CARD_FULL_P - CARD_START_P);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    return { opacity: ease, leftX: (1 - ease) * -110, rightX: (1 - ease) * 110, y: (1 - ease) * 18 };
  }
  // hold: CARD_FULL_P → 54%
  if (p <= CARD_HOLD_P) return { opacity: 1, leftX: 0, rightX: 0, y: 0 };
  // slide out: 54% → 64%
  if (p <= CARD_EXIT_P) {
    const t = (p - CARD_HOLD_P) / (CARD_EXIT_P - CARD_HOLD_P);
    const ease = t * t; // quadratic ease-in (faster exit)
    return { opacity: 1 - ease, leftX: -ease * 110, rightX: ease * 110, y: ease * 14 };
  }
  return { opacity: 0, leftX: -110, rightX: 110, y: 14 };
}

interface HomeViewProps {
  onSelectTab?: (tab: string) => void;
  onLogin?: () => void;
}

export function HomeView({ onSelectTab, onLogin }: HomeViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bitmapsRef = useRef<(ImageBitmap | null)[]>(new Array(TOTAL_FRAMES).fill(null));
  const lastDrawnRef = useRef<number>(-1);

  // Direct DOM references — eliminates 60fps React re-renders during scroll
  const heroRef = useRef<HTMLDivElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const finalCtaRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isSectionVisible, setIsSectionVisible] = useState(false);

  const currentProgressRef = useRef(0);

  // Hardware-accelerated GPU composite transforms only (zero layout reflows)
  const updateDOMTransforms = useCallback((p: number) => {
    // 1. Hero overlay: fades & lifts
    if (heroRef.current) {
      const heroOpacity = Math.max(0, 1 - p * 5);
      heroRef.current.style.opacity = heroOpacity.toFixed(3);
      heroRef.current.style.transform = `translate3d(0, ${(-p * 60).toFixed(1)}px, 0)`;
      heroRef.current.style.visibility = heroOpacity <= 0 ? "hidden" : "visible";
    }

    // 2. Milestone cards: slide in, hold, slide out
    const motion = getCardMotion(p);
    if (leftCardRef.current) {
      leftCardRef.current.style.opacity = motion.opacity.toFixed(3);
      leftCardRef.current.style.transform = `translate3d(${motion.leftX.toFixed(1)}px, ${motion.y.toFixed(1)}px, 0)`;
      leftCardRef.current.style.visibility = motion.opacity <= 0 ? "hidden" : "visible";
    }
    if (rightCardRef.current) {
      rightCardRef.current.style.opacity = motion.opacity.toFixed(3);
      rightCardRef.current.style.transform = `translate3d(${motion.rightX.toFixed(1)}px, ${motion.y.toFixed(1)}px, 0)`;
      rightCardRef.current.style.visibility = motion.opacity <= 0 ? "hidden" : "visible";
    }

    // 3. Final CTA pill (appears at p >= 75%)
    if (finalCtaRef.current) {
      const ctaOpacity = Math.max(0, (p - 0.75) * 4);
      finalCtaRef.current.style.opacity = ctaOpacity.toFixed(3);
      finalCtaRef.current.style.visibility = ctaOpacity <= 0 ? "hidden" : "visible";
    }

    // 4. Progress hairline bar (scaleX avoids triggering layout reflows)
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
    }
  }, []);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    // Nearest-neighbor fallback: find closest valid decoded frame
    let bmp = bitmapsRef.current[index];
    let actualIndex = index;
    if (!bmp || bmp.width === 0) {
      bmp = null;
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const left = index - offset;
        const right = index + offset;
        if (left >= 0 && bitmapsRef.current[left] && bitmapsRef.current[left]!.width > 0) {
          bmp = bitmapsRef.current[left];
          actualIndex = left;
          break;
        }
        if (right < TOTAL_FRAMES && bitmapsRef.current[right] && bitmapsRef.current[right]!.width > 0) {
          bmp = bitmapsRef.current[right];
          actualIndex = right;
          break;
        }
      }
    }

    if (!canvas || !bmp || bmp.width === 0 || bmp.height === 0 || lastDrawnRef.current === actualIndex) return;

    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext("2d", { alpha: false });
      if (ctxRef.current) {
        ctxRef.current.imageSmoothingEnabled = true;
        ctxRef.current.imageSmoothingQuality = "low";
      }
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    try {
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      lastDrawnRef.current = actualIndex;

    } catch {
      // If bitmap was detached, invalidate so it can be re-fetched safely
      bitmapsRef.current[actualIndex] = null;
      lastDrawnRef.current = -1;
    }
  }, []);

  // Direct 1:1 hardware vsync scroll binding with cached geometry (zero layout thrashing)
  useEffect(() => {
    const el = scrollContainerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    let trackScrollDistance = Math.max(1, track.offsetHeight - el.clientHeight);
    const updateDimensions = () => {
      if (el && track) {
        const next = track.offsetHeight - el.clientHeight;
        if (next > 0) trackScrollDistance = next;
      }
    };

    const ro = new ResizeObserver(updateDimensions);
    ro.observe(el);
    ro.observe(track);
    window.addEventListener("resize", updateDimensions, { passive: true });

    let rafId: number | null = null;
    let latestProgress = 0;

    const onScroll = () => {
      if (trackScrollDistance <= 0) return;
      latestProgress = Math.min(1, Math.max(0, el.scrollTop / trackScrollDistance));
      currentProgressRef.current = latestProgress;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const fi = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(latestProgress * (TOTAL_FRAMES - 1))));
          drawFrame(fi);
          updateDOMTransforms(latestProgress);
        });
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    updateDimensions();
    onScroll();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDimensions);
      el.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [drawFrame, updateDOMTransforms]);

  // Entrance observer for the additional section at the end of the scroll
  useEffect(() => {
    const target = sectionRef.current;
    const root = scrollContainerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSectionVisible(entry.isIntersecting);
      },
      {
        root: root || null,
        threshold: 0.15,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Priority Stride-Based Frame Loading with Texture Downscaling
  useEffect(() => {
    let isCancelled = false;
    let loaded = 0;

    const targetWidth = Math.min(
      1920,
      typeof window !== "undefined"
        ? Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 1.5))
        : 1920
    );

    const loadFrame = async (frameNum: number): Promise<void> => {
      const index = frameNum - START_FRAME;
      const existing = bitmapsRef.current[index];
      if (existing && existing.width > 0) return;
      const url = `/frames/frame_${frameNum.toString().padStart(4, "0")}.webp`;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const blob = await response.blob();
        let bitmap: ImageBitmap;
        try {
          // Optimized decode to display resolution (cuts VRAM by 45%)
          bitmap = await createImageBitmap(blob, { resizeWidth: targetWidth, resizeQuality: "medium" });
        } catch {
          bitmap = await createImageBitmap(blob);
        }
        if (isCancelled) {
          try { bitmap.close(); } catch {}
          return;
        }
        bitmapsRef.current[index] = bitmap;
        loaded++;

        // Draw initial frame immediately as soon as ready
        if (index === 0 && canvasRef.current) {
          canvasRef.current.width = bitmap.width;
          canvasRef.current.height = bitmap.height;
          const curIndex = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(currentProgressRef.current * (TOTAL_FRAMES - 1))));
          drawFrame(curIndex);
        }
      } catch (err) {
        console.warn(`Frame ${frameNum} load error:`, err);
      }
    };

    // Staged Preload:
    // Phase 1: Immediately fetch Frame 0
    // Phase 2: Keyframe stride (every 8 frames) across the entire sequence
    // Phase 3: Fill in all remaining intermediate frames in non-blocking batches
    const loadAll = async () => {
      // 1. Initial Frame
      await loadFrame(START_FRAME);

      // 2. Keyframes across the full sequence (Stride of 8)
      const keyframePromises: Promise<void>[] = [];
      for (let f = START_FRAME + 8; f <= END_FRAME; f += 8) {
        keyframePromises.push(loadFrame(f));
      }
      await Promise.all(keyframePromises);

      // 3. Fill in all remaining frames in non-blocking batches of 10
      const remaining: number[] = [];
      for (let f = START_FRAME; f <= END_FRAME; f++) {
        const b = bitmapsRef.current[f - START_FRAME];
        if (!b || b.width === 0) {
          remaining.push(f);
        }
      }

      for (let i = 0; i < remaining.length; i += 10) {
        if (isCancelled) break;
        const batch = remaining.slice(i, i + 10).map((f) => loadFrame(f));
        await Promise.all(batch);
        await new Promise((r) => setTimeout(r, 12));
      }
    };

    loadAll();

    return () => {
      isCancelled = true;
      for (let i = 0; i < bitmapsRef.current.length; i++) {
        const b = bitmapsRef.current[i];
        if (b) {
          try { b.close(); } catch {}
          bitmapsRef.current[i] = null;
        }
      }
      lastDrawnRef.current = -1;
    };
  }, [drawFrame]);

  return (
    <div
      ref={scrollContainerRef}
      className="relative h-full w-full overflow-y-auto no-scrollbar bg-[#0C100D]"
    >
      {/* Technical DAG grid background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="grid-overlay absolute inset-0 opacity-30" />
      </div>

      {/* 700vh scroll track */}
      <div ref={trackRef} className="relative z-10 h-[700vh] w-full">
        <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
          {/* 3D Canvas with hardware compositor scaling */}
          <canvas
            ref={canvasRef}
            className="relative z-0 h-full w-full object-cover sm:object-contain will-change-transform scale-[1.35] sm:scale-100 transition-transform duration-300"
          />

          {/* Floating luminous particle layer — sits at z-10 below cards & hero */}
          <div className="hidden md:block">
            <ParticleCanvas count={65} />
          </div>

          {/* ── Hero overlay ── positioned below 3D object at z-20 (Direct GPU transforms) */}
          <div
            ref={heroRef}
            className="absolute inset-0 flex flex-col items-center justify-end pb-16 sm:pb-20 pointer-events-none px-4 text-center z-20 will-change-transform"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center"
            >
              {/* Plucked Text string-physics interactive title (Memoized) */}
              <PluckedText
                text="CHRONOGRAPH"
                accentStartIndex={6}
                accentClassName="text-[#75d555ff]"
                textClassName="text-[#E8ECE4]"
                tension={1.2}
                className="my-1 font-[family-name:var(--font-brand)]"
              />

              <p className="mt-2 text-sm text-[#8B968B] max-w-sm leading-relaxed">
                High-throughput workflow orchestration with zero cycle deadlocks and atomic fan-out.
              </p>

              {/* Scroll hint — plain, minimal */}
              <div className="mt-8 flex items-center gap-2 text-[#8B968B] select-none">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#7FBF6A]" />
                <span className="text-[11px] tracking-widest uppercase font-medium text-[#8B968B]">Scroll to explore</span>
              </div>
            </motion.div>
          </div>

          {/* ── Milestone cards ── z-30 (Above particles and 3D canvas) ── */}
          <div className="absolute inset-0 flex items-center justify-center md:justify-between px-4 sm:px-8 md:px-14 lg:px-20 pointer-events-none z-30 overflow-hidden">
            {/* Left: The Dormammu Loop? */}
            <div
              ref={leftCardRef}
              className="pointer-events-none will-change-transform flex flex-col items-center"
              style={{ opacity: 0, transform: "translate3d(-110px, 18px, 0)", visibility: "hidden" }}
            >
              {/* Technical Glass Card — 1px border, high contrast */}
              <div
                className="relative overflow-hidden w-[calc(100vw-2.5rem)] max-w-[340px] md:w-72 lg:w-80 min-h-[380px] sm:min-h-[460px] lg:min-h-[500px] rounded-2xl p-5 sm:p-7 flex flex-col justify-between"
                style={{
                  background: "rgba(20, 26, 21, 0.65)",
                  backdropFilter: "blur(20px) saturate(140%)",
                  WebkitBackdropFilter: "blur(20px) saturate(140%)",
                  border: "1px solid #243026",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                {/* Micro-typography pattern overlay */}
                <div
                  className="pointer-events-none absolute inset-0 select-none overflow-hidden opacity-[0.08] p-5 text-[8.5px] font-mono leading-tight tracking-[0.16em] uppercase text-[#8B968B] flex flex-col justify-between"
                  aria-hidden="true"
                >
                  <div>
                    <p>ABOUT ENGINE</p>
                    <p>CHRONOGRAPH DISTRIBUTED</p>
                    <p>DAG WORKFLOW SYSTEM</p>
                    <p>CYCLE GUARD</p>
                  </div>
                  <div className="text-right">
                    <p>3-COLOR DFS VERIFIER</p>
                    <p>KAHN&apos;S ALGORITHM O(V+E)</p>
                    <p>ATOMIC ACYCLIC ENGINE</p>
                  </div>
                  <div>
                    <p>ZERO CYCLE DEADLOCKS</p>
                    <p>ATOMIC FAN-OUT</p>
                    <p>TOPOLOGICAL RESOLVER</p>
                  </div>
                </div>

                {/* Top Section: Badge & Index */}
                <div className="relative z-10">
                  <div className="flex items-center mb-4">
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-[#243026] bg-[#141A15]/80 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8B968B] select-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A]" />
                      <span>Cycle Guard</span>
                    </div>
                  </div>

                  <h3 className="font-script text-2xl sm:text-[28px] text-[#E8ECE4] mb-2 leading-tight tracking-normal">
                    The Dormammu Loop?
                  </h3>
                  <p className="text-xs text-[#8B968B] leading-relaxed font-normal">
                    ChronoGraph runs 3-color DFS and Kahn&apos;s algorithm on every DAG blueprint,
                    terminating cyclic deadlocks before a single worker is dispatched.
                  </p>
                </div>

                {/* Middle Section: Spec Snippet */}
                <div className="relative z-10 my-4">
                  <div className="rounded-2xl border border-[#243026] bg-[#0C100D]/60 p-3.5 font-mono text-[10px] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">ALGORITHM</span>
                      <span className="text-[#E8ECE4] font-medium">KAHN_DFS_V3</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">CYCLE_GUARD</span>
                      <span className="text-[#E8ECE4] font-medium">ACTIVE // STRICT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">RESOLUTION</span>
                      <span className="text-[#E8ECE4] font-medium">NON_BLOCKING</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Stat Row */}
                <div className="relative z-10 pt-3 border-t border-[#243026] flex items-center gap-3">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#7FBF6A] animate-pulse" />
                  <span className="text-[10px] text-[#8B968B] font-mono">3-Color DFS</span>
                  <span className="h-px flex-1 bg-[#243026]" />
                  <span className="text-[10px] text-[#E8ECE4] font-mono font-semibold">O(V+E)</span>
                </div>
              </div>
            </div>

            {/* Right: The Time Stone? (Desktop / Tablet only to prevent mobile card collision) */}
            <div
              ref={rightCardRef}
              className="hidden md:flex pointer-events-none will-change-transform flex-col items-center"
              style={{ opacity: 0, transform: "translate3d(110px, 18px, 0)", visibility: "hidden" }}
            >
              {/* Technical Glass Card — 1px border, high contrast */}
              <div
                className="relative overflow-hidden w-64 sm:w-72 lg:w-80 min-h-[380px] sm:min-h-[460px] lg:min-h-[500px] rounded-2xl p-5 sm:p-7 flex flex-col justify-between"
                style={{
                  background: "rgba(20, 26, 21, 0.65)",
                  backdropFilter: "blur(20px) saturate(140%)",
                  WebkitBackdropFilter: "blur(20px) saturate(140%)",
                  border: "1px solid #243026",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                {/* Micro-typography pattern overlay */}
                <div
                  className="pointer-events-none absolute inset-0 select-none overflow-hidden opacity-[0.08] p-5 text-[8.5px] font-mono leading-tight tracking-[0.16em] uppercase text-[#8B968B] flex flex-col justify-between"
                  aria-hidden="true"
                >
                  <div>
                    <p>ABOUT ENGINE</p>
                    <p>TEMPORAL LUA SYSTEM</p>
                    <p>BULLMQ WORKER POOL</p>
                    <p>TIME STONE</p>
                  </div>
                  <div className="text-right">
                    <p>ATOMIC REDIS KEYS</p>
                    <p>SET NX IDEMPOTENCY</p>
                    <p>DELAY TRANSITIONS</p>
                  </div>
                  <div>
                    <p>DEAD LETTER ARCHIVE</p>
                    <p>SUB-MS ARBITRATION</p>
                    <p>142 WORKERS SYNCED</p>
                  </div>
                </div>

                {/* Top Section: Badge & Index */}
                <div className="relative z-10">
                  <div className="flex items-center mb-4">
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-[#243026] bg-[#141A15]/80 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8B968B] select-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A]" />
                      <span>Temporal Engine</span>
                    </div>
                  </div>

                  <h3 className="font-script text-2xl sm:text-[28px] text-[#E8ECE4] mb-2 leading-tight tracking-normal">
                    The Time Stone?
                  </h3>
                  <p className="text-xs text-[#8B968B] leading-relaxed font-normal">
                    Atomic Redis Lua locks prevent race conditions. BullMQ manages non-blocking
                    delay transitions and dead-letter jobs replay across execution history.
                  </p>
                </div>

                {/* Middle Section: Spec Snippet */}
                <div className="relative z-10 my-4">
                  <div className="rounded-2xl border border-[#243026] bg-[#0C100D]/60 p-3.5 font-mono text-[10px] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">COORDINATOR</span>
                      <span className="text-[#E8ECE4] font-medium">REDIS_LUA_V7</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">CONCURRENCY</span>
                      <span className="text-[#E8ECE4] font-medium">20 / WORKER</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B968B]">ATOMIC_LOCK</span>
                      <span className="text-[#E8ECE4] font-medium">SET_NX_ACQUIRED</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Stat Row */}
                <div className="relative z-10 pt-3 border-t border-[#243026] flex items-center gap-3">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#7FBF6A] animate-pulse" />
                  <span className="text-[10px] text-[#8B968B] font-mono">Redis Lua</span>
                  <span className="h-px flex-1 bg-[#243026]" />
                  <span className="text-[10px] text-[#E8ECE4] font-mono font-semibold">Atomic</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Final CTA — navbar-style pill ── */}
          <div
            ref={finalCtaRef}
            className="absolute inset-x-0 bottom-14 flex justify-center px-4 pointer-events-auto will-change-transform"
            style={{ opacity: 0, visibility: "hidden" }}
          >
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 rounded-2xl px-5 py-3 max-w-xl w-full transition-all duration-300 text-center sm:text-left"
              style={{
                background: "rgba(20, 26, 21, 0.75)",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
                border: "1.5px solid #243026",
                boxShadow: "0 12px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div>
                <p className="text-sm font-semibold tracking-tight text-[#E8ECE4]">Explore your creativity</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectTab?.("studio")}
                  type="button"
                  className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-colors cursor-pointer border border-[#7FBF6A]"
                >
                  <Workflow className="h-3.5 w-3.5" />
                  <span>Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={onLogin}
                  type="button"
                  className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-[#E8ECE4] border border-[#243026] hover:border-[#7FBF6A]/50 hover:text-white active:scale-[0.98] transition-all cursor-pointer bg-[#141A15]/80"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Login</span>
                </button>
              </div>
            </div>
          </div>

          {/* Scroll progress — 1px hairline without transition lag */}
          <div className="absolute bottom-0 inset-x-0 h-px bg-[#243026] z-40">
            <div
              ref={progressBarRef}
              className="h-full w-full bg-[#7FBF6A] will-change-transform origin-left"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
        </div>
      </div>

      {/* ── Additional Section at the end of the scroll (separate from the 3D canvas) ── */}
      <section
        ref={sectionRef}
        className="relative z-20 min-h-screen w-full bg-[#0C100D] border-t border-[#243026] py-24 sm:py-32 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Subtle background ambient lighting */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#7FBF6A]/5 rounded-full blur-[140px]" />
          <div className="grid-overlay absolute inset-0 opacity-20" />
        </div>

        {/* 2-Column Section Layout: Left details, Right execution SVG */}
        <div
          className={`relative z-10 max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center transition-all duration-700 ease-out ${
            isSectionVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-16"
          }`}
        >
          {/* Left Column: Details & Capabilities */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#243026] bg-[#141A15] px-3 py-1 text-[10px] font-mono text-[#7FBF6A] select-none">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A] animate-pulse" />
                <span>CHRONOGRAPH ENGINE // DISTRIBUTED ARCHITECTURE</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#E8ECE4] leading-tight">
                Zero-Cycle Distributed Workflow Orchestration
              </h2>
              <p className="text-sm text-[#8B968B] leading-relaxed">
                ChronoGraph coordinates high-throughput DAG execution graphs with mathematical safety.
                Pre-execution 3-color DFS terminates circular deadlocks before dispatch, while Redis Lua
                atomic locks ensure non-blocking resolution across concurrent BullMQ worker clusters.
              </p>
            </div>

            {/* Architecture Highlights */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-[#243026] bg-[#141A15]/60 p-3.5">
                <div className="mt-0.5 rounded-lg border border-[#243026] bg-[#141A15] p-2 text-[#7FBF6A]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#E8ECE4]">3-Color DFS Guard</h4>
                  <p className="text-[11px] text-[#8B968B] leading-relaxed">
                    Terminates cyclic deadlocks and recursive loops at blueprint ingest in O(V+E) topological time.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#243026] bg-[#141A15]/60 p-3.5">
                <div className="mt-0.5 rounded-lg border border-[#243026] bg-[#141A15] p-2 text-[#7FBF6A]">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#E8ECE4]">Temporal Lua Locks</h4>
                  <p className="text-[11px] text-[#8B968B] leading-relaxed">
                    Sub-millisecond atomic state arbitration in Redis eliminates worker race conditions and double-spends.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#243026] bg-[#141A15]/60 p-3.5">
                <div className="mt-0.5 rounded-lg border border-[#243026] bg-[#141A15] p-2 text-[#7FBF6A]">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#E8ECE4]">Automated DLQ Replay</h4>
                  <p className="text-[11px] text-[#8B968B] leading-relaxed">
                    Dead-letter jobs buffer under exponential backoff with full jitter and instant one-click pipeline replay.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                onClick={() => onSelectTab?.("studio")}
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-colors cursor-pointer border border-[#7FBF6A]"
              >
                <Workflow className="h-4 w-4" />
                <span>Open Studio</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={onLogin}
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-medium text-[#E8ECE4] border border-[#243026] hover:border-[#7FBF6A]/50 hover:text-white active:scale-[0.98] transition-all cursor-pointer bg-[#141A15]/80"
              >
                <LogIn className="h-4 w-4" />
                <span>Login</span>
              </button>
            </div>
          </div>

          {/* Right Column: 3D Flippable Execution SVG Terminal */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <WorkflowVisualizer3D />
          </div>
        </div>
      </section>

      {/* ── Feature Cards Section: Skiper34 StickyCard_003 ── */}
      <section className="relative z-20 flex w-full flex-col items-center gap-[8vh] sm:gap-[10vh] bg-[#0C100D] border-t border-[#243026] px-3 sm:px-6 lg:px-8 pt-[20vh] sm:pt-[35vh] pb-[25vh] sm:pb-[40vh]">
        {/* Subtle background ambient lighting */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#7FBF6A]/5 rounded-full blur-[160px]" />
          <div className="grid-overlay absolute inset-0 opacity-15" />
        </div>

        {/* Section Heading & Skiper34 Scroll Indicator */}
        <div className="relative z-10 max-w-4xl w-full text-center space-y-4 mb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#243026] bg-[#141A15] px-3 py-1 text-[10px] font-mono text-[#7FBF6A] select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7FBF6A] animate-pulse" />
            <span>PLATFORM CAPABILITIES // CORE ENGINE FEATURES</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#E8ECE4]">
            Engineered for Mathematical Safety & Throughput
          </h2>
          <p className="text-sm sm:text-base text-[#8B968B] max-w-2xl mx-auto leading-relaxed">
            Every layer of ChronoGraph is purpose-built to eliminate distributed systems failure modes:
            from graph cycle deadlocks to worker race conditions and unhandled pipeline faults.
          </p>

          <div className="pt-8 flex flex-col items-center">
            <span className="relative max-w-[16ch] font-mono text-[11px] uppercase tracking-widest text-[#7FBF6A] opacity-80 after:absolute after:left-1/2 after:top-full after:mt-3 after:h-16 after:w-px after:bg-gradient-to-b after:from-[#7FBF6A] after:to-transparent after:content-['']">
              scroll down to see effect
            </span>
          </div>
        </div>

        {/* Sticky Cards Stack */}
        {FEATURE_CARDS.map((card, idx) => (
          <StickyCard_003
            key={idx}
            {...card}
            index={idx}
            containerRef={scrollContainerRef}
          />
        ))}
      </section>

      {/* ── Compact Footer: 3 LinkedIn Icon Links + 1 GitHub Link ── */}
      <footer className="relative z-20 w-full border-t border-[#243026] py-8 px-6 sm:px-12 bg-[#0C100D] flex items-center justify-center gap-4">
        <div className="flex items-center gap-3">
          <a
            href="https://www.linkedin.com/in/sanskar-seth"
            target="_blank"
            rel="noopener noreferrer"
            title="Sanskar Seth on LinkedIn"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#7FBF6A] hover:border-[#7FBF6A]/50 transition-colors"
          >
            <LinkedInIcon className="h-4 w-4" />
          </a>
          <a
            href="https://www.linkedin.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Team Member 2 on LinkedIn"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#7FBF6A] hover:border-[#7FBF6A]/50 transition-colors"
          >
            <LinkedInIcon className="h-4 w-4" />
          </a>
          <a
            href="https://www.linkedin.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Team Member 3 on LinkedIn"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#7FBF6A] hover:border-[#7FBF6A]/50 transition-colors"
          >
            <LinkedInIcon className="h-4 w-4" />
          </a>
          <div className="h-4 w-px bg-[#243026] mx-1" />
          <a
            href="https://github.com/SANSKAR-D/krishi-setu-2.0"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#7FBF6A] hover:border-[#7FBF6A]/50 transition-colors"
          >
            <GitHubIcon className="h-4 w-4" />
          </a>
        </div>
      </footer>
    </div>
  );
}

function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.94 0 1.7-.76 1.7-1.7s-.76-1.7-1.7-1.7-1.7.76-1.7 1.7.76 1.7 1.7 1.7m1.4 9.74v-8.37H5.06v8.37h2.8z" />
    </svg>
  );
}

function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
