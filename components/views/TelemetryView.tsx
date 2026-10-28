"use client";

import React, { useState, useEffect } from "react";
import { Activity, Server, RefreshCw, Radio } from "lucide-react";
import { CronSchedulersPanel } from "@/components/telemetry/CronSchedulersPanel";
import { getSocket } from "@/lib/socket/client";

interface WorkerNode {
  id: string;
  name: string;
  status: "healthy" | "busy";
  activeJobs: number;
  maxConcurrency: number;
  cpu: number;
  memory: string;
  lastHeartbeat: string;
}

export function TelemetryView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";
  const [streamActive, setStreamActive] = useState(true);
  const [events, setEvents] = useState<Array<{ id: string; time: string; event: string; status: string; latency: number }>>([]);

  const [metrics, setMetrics] = useState({
    waiting: 0,
    active: 0,
    delayed: 0,
    dlq: 0,
  });

  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [autoscaler, setAutoscaler] = useState<{
    enabled: boolean;
    status: string;
    currentWorkers: number;
    desiredWorkers: number;
    minWorkers: number;
    maxWorkers: number;
    lastAction: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/v1/cluster/health");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data) {
          if (data.queueMetrics) {
            setMetrics({
              waiting: data.queueMetrics.waiting ?? data.queueMetrics.Waiting ?? 0,
              active: data.queueMetrics.active ?? data.queueMetrics.Active ?? 0,
              delayed: data.queueMetrics.delayed ?? data.queueMetrics.Delayed ?? 0,
              dlq: data.queues?.deadLetter?.database?.unresolved ?? data.queueMetrics.dlq ?? 0,
            });
          }
          if (data.autoscaler) {
            setAutoscaler(data.autoscaler);
          }
          if (Array.isArray(data.workers)) {
            setWorkers(
              data.workers.map((w: any) => {
                const activeJobs = w.activeJobs ?? 0;
                const maxConcurrency = w.concurrency ?? 10;
                const isBusy = activeJobs > 0 || w.status === "busy";
                return {
                  id: w.workerId || w.id || "worker",
                  name: w.name || w.workerId || "dag-worker",
                  status: isBusy ? "busy" : "healthy",
                  activeJobs,
                  maxConcurrency,
                  cpu: w.cpu ?? 0,
                  memory: w.memory || "0 MB",
                  lastHeartbeat: w.lastHeartbeat || "Just now",
                };
              })
            );
          }
          if (Array.isArray(data.recentEvents) && data.recentEvents.length > 0) {
            setEvents((prev) => {
              if (prev.length === 0) return data.recentEvents;
              const existingIds = new Set(prev.map((e) => e.id));
              const fresh = data.recentEvents.filter((e: any) => !existingIds.has(e.id));
              return [...prev, ...fresh].slice(0, 50);
            });
          }
        }
      } catch {
        // network error / dev server reload
      }
    };

    fetchHealth();
    const pollId = setInterval(fetchHealth, 4000);
    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    if (!streamActive) return;
    let es: EventSource | null = null;
    let socket: any = null;

    const processParsedEvent = (parsed: any) => {
      if (!parsed) return;
      if (parsed.status === "connected" && !parsed.event) return;
      if (parsed.event === "AUTOSCALER_UPDATE") {
        setAutoscaler(parsed);
        return;
      }
      const eventName = parsed.event || (parsed.nodeId ? `EXEC:${parsed.nodeId}` : "EVENT");
      const status = parsed.status || (eventName.includes("FAIL") ? "FAILED" : "SUCCESS");
      const latency = parsed.latency ?? (parsed.durationMs ? Math.round(parsed.durationMs) : 12);
      const time = parsed.timestamp
        ? new Date(parsed.timestamp).toLocaleTimeString()
        : new Date().toLocaleTimeString();

      setEvents((prev) => [
        {
          id: parsed.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          time,
          event: eventName,
          status,
          latency,
        },
        ...prev.slice(0, 49),
      ]);
    };

    const handleEventDataStr = (dataStr: string) => {
      try {
        processParsedEvent(JSON.parse(dataStr));
      } catch {
        // ignore non-json keepalive
      }
    };

    // 1. Primary: WebSocket (Socket.IO)
    try {
      socket = getSocket({ channel: "cluster" });
      if (socket) {
        socket.on("cluster:event", processParsedEvent);
        socket.on("WORKFLOW_TRIGGERED", processParsedEvent);
        socket.on("NODE_STATE_CHANGE", processParsedEvent);
        socket.on("JOB_COMPLETED", processParsedEvent);
        socket.on("AUTOSCALER_UPDATE", processParsedEvent);
        socket.on("message", (msg: any) => {
          if (typeof msg === "string") handleEventDataStr(msg);
          else processParsedEvent(msg);
        });
      }
    } catch {
      // socket connection error
    }

    // 2. Fallback: SSE connection
    try {
      es = new EventSource("/api/v1/cluster/events");
      es.onmessage = (e) => handleEventDataStr(e.data);
      es.addEventListener("WORKFLOW_TRIGGERED", (e: any) => handleEventDataStr(e.data));
      es.addEventListener("NODE_STATE_CHANGE", (e: any) => handleEventDataStr(e.data));
      es.addEventListener("JOB_COMPLETED", (e: any) => handleEventDataStr(e.data));
    } catch {
      // EventSource failed to instantiate
    }

    return () => {
      if (socket) {
        socket.off("cluster:event", processParsedEvent);
        socket.off("WORKFLOW_TRIGGERED", processParsedEvent);
        socket.off("NODE_STATE_CHANGE", processParsedEvent);
        socket.off("JOB_COMPLETED", processParsedEvent);
        socket.off("AUTOSCALER_UPDATE", processParsedEvent);
      }
      if (es) {
        es.close();
      }
    };
  }, [streamActive]);

  const statusColor = (s: string) =>
    s === "SUCCESS"
      ? "text-[#7FBF6A]"
      : s === "RUNNING"
      ? isLight
        ? "text-[#4A8F3F]"
        : "text-[#92CF7D]"
      : s === "HEARTBEAT"
      ? "text-[#E5B86A]"
      : isLight
      ? "text-[#5E695E]"
      : "text-[#8B968B]";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:pl-8 lg:pr-48 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className={`text-xl font-bold tracking-tight ${
              isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
            }`}
          >
            Cluster Telemetry &amp; SSE Stream
          </h2>
          <p
            className={`text-xs font-medium mt-0.5 ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            Real-time cluster health, Redis Pub/Sub events, and BullMQ worker metrics.
          </p>
        </div>
        <button
          onClick={() => setStreamActive(!streamActive)}
          type="button"
          className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            isLight
              ? "border-[#D1D9D0] bg-[#FAFBF9] text-[#141A15] hover:border-[#7FBF6A] shadow-xs active:scale-95"
              : "border-[#243026] bg-[#0C100D] text-[#E8ECE4] hover:border-[#7FBF6A]/50 shadow-xs active:scale-95"
          }`}
        >
          <Radio
            className={`h-3.5 w-3.5 ${
              streamActive
                ? "text-[#7FBF6A] animate-pulse"
                : isLight
                ? "text-[#8B968B]"
                : "text-[#5E695E]"
            }`}
          />
          <span>{streamActive ? "Streaming Live" : "Stream Paused"}</span>
        </button>
      </div>

      {/* Queue Depth Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Waiting Jobs",
            value: String(metrics.waiting),
            color: isLight ? "text-[#141A15]" : "text-[#E8ECE4]",
            bar: "bg-[#8B968B] w-[25%]",
          },
          {
            label: "Active Executing",
            value: String(metrics.active),
            color: "text-[#7FBF6A]",
            bar: "bg-[#7FBF6A] w-[40%] shadow-[0_0_8px_rgba(127,191,106,0.4)]",
          },
          {
            label: "Delayed Transitions",
            value: String(metrics.delayed),
            color: "text-[#E5B86A]",
            bar: "bg-[#E5B86A] w-[15%]",
          },
          {
            label: "Dead Letter Jobs",
            value: String(metrics.dlq),
            color: "text-[#E5735C]",
            bar: "bg-[#E5735C] w-[10%] shadow-[0_0_8px_rgba(229,115,92,0.4)]",
          },
        ].map(({ label, value, color, bar }) => (
          <div
            key={label}
            className={`rounded-2xl p-4 border transition-all ${
              isLight
                ? "border-[#E2E6E3] bg-[#FAFBF9] shadow-xs"
                : "border-[#243026] bg-[#141A15] shadow-xs"
            }`}
          >
            <div>
              <p
                className={`text-xs font-medium ${
                  isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                }`}
              >
                {label}
              </p>
              <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
              <div
                className={`w-full h-1.5 rounded-full mt-3 overflow-hidden ${
                  isLight ? "bg-[#E2E6E3]" : "bg-[#0C100D]"
                }`}
              >
                <div className={`h-full rounded-full ${bar}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BullMQ Repeatable Cron Schedulers Panel (Task T2.5) */}
      <CronSchedulersPanel theme={theme} />

      {/* Worker Pool Table */}
      <div
        className={`rounded-2xl overflow-hidden border ${
          isLight
            ? "border-[#E2E6E3] bg-[#FAFBF9] shadow-xs"
            : "border-[#243026] bg-[#141A15] shadow-xs"
        }`}
      >
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isLight ? "border-[#E2E6E3] bg-[#F7F9F6]" : "border-[#243026] bg-[#0C100D]/60"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[#7FBF6A]" />
              <h3
                className={`text-sm font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                Active Worker Pool ({workers.length} {workers.length === 1 ? "Node" : "Nodes"})
              </h3>
            </div>
            {autoscaler?.enabled && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border bg-[#7FBF6A]/10 text-[#7FBF6A] border-[#7FBF6A]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7FBF6A] animate-pulse" />
                Celery-Style Autoscaler ({autoscaler.currentWorkers}/{autoscaler.maxWorkers})
                {autoscaler.status === "scaling_up" && (
                  <span className="text-amber-400 font-bold ml-1">↑ Scaling Up</span>
                )}
                {autoscaler.status === "scaling_down" && (
                  <span className="text-blue-400 font-bold ml-1">↓ Scaling Down</span>
                )}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-mono font-medium ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            {autoscaler?.lastAction || "Auto-balanced concurrency"}
          </span>
        </div>
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead
              className={`font-mono text-[11px] border-b ${
                isLight
                  ? "bg-[#ECEFEA] text-[#5E695E] border-[#D1D9D0]"
                  : "bg-[#0C100D]/70 text-[#8B968B] border-[#243026]"
              }`}
            >
              <tr>
                {["Worker ID", "Status", "Concurrency", "CPU Usage", "Memory", "Heartbeat"].map((h) => (
                  <th key={h} className="py-3 px-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isLight
                  ? "divide-[#E2E6E3] text-[#141A15]"
                  : "divide-[#243026] text-[#E8ECE4]"
              }`}
            >
              {workers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className={`py-8 text-center text-xs font-mono ${
                      isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Server className="h-5 w-5 opacity-40" />
                      <span>No active background workers connected.</span>
                      <span className="text-[10px] opacity-70">
                        Run <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">npm run worker:autoscale</code> to enable Celery-style dynamic autoscaling, or <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">npm run worker</code> for a fixed worker.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                workers.map((w) => (
                  <tr
                    key={w.id}
                    className={`transition-colors ${
                      isLight ? "hover:bg-[#F3F6F2]/80" : "hover:bg-[#1A221C]/60"
                    }`}
                  >
                    <td
                      className={`py-3 px-4 font-mono font-semibold ${
                        isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                      }`}
                    >
                      {w.name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                          w.status === "busy"
                            ? "bg-[#E5B86A]/15 text-[#E5B86A] border-[#E5B86A]/30"
                            : "bg-[#7FBF6A]/15 text-[#7FBF6A] border-[#7FBF6A]/30"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            w.status === "busy" ? "bg-[#E5B86A]" : "bg-[#7FBF6A] animate-pulse"
                          }`}
                        />
                        {w.status}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 font-mono ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      }`}
                    >
                      {w.activeJobs} / {w.maxConcurrency} jobs
                    </td>
                    <td
                      className={`py-3 px-4 font-mono ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      }`}
                    >
                      {w.cpu}%
                    </td>
                    <td
                      className={`py-3 px-4 font-mono ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      }`}
                    >
                      {w.memory}
                    </td>
                    <td className="py-3 px-4 text-[#7FBF6A] font-mono text-[11px]">
                      {w.lastHeartbeat}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SSE Real-Time Stream */}
      <div
        className={`rounded-2xl p-5 border ${
          isLight
            ? "border-[#E2E6E3] bg-[#FAFBF9] shadow-xs"
            : "border-[#243026] bg-[#141A15] shadow-xs"
        }`}
      >
        <div
          className={`flex items-center justify-between pb-3 border-b ${
            isLight ? "border-[#E2E6E3]" : "border-[#243026]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#7FBF6A]" />
            <span
              className={`text-sm font-bold ${
                isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
              }`}
            >
              Live Event Stream
            </span>
          </div>
          <span
            className={`font-mono text-[11px] font-semibold ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            SSE Chunked
          </span>
        </div>
        <div className="relative z-10 mt-3 space-y-2">
          {events.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed ${
                isLight
                  ? "border-[#D1D9D0] bg-[#F7F9F6] text-[#5E695E]"
                  : "border-[#243026] bg-[#0C100D]/40 text-[#8B968B]"
              }`}
            >
              <Activity className="h-5 w-5 text-[#7FBF6A] mb-1.5 opacity-70" />
              <p className="text-xs font-semibold">Event stream on standby (connected to Redis)</p>
              <p className="text-[11px] opacity-75 mt-0.5">
                No live events yet. Execute a workflow in Studio to stream real-time cluster events.
              </p>
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className={`flex items-center justify-between font-mono text-xs p-2.5 rounded-xl border ${
                  isLight
                    ? "bg-[#ECEFEA] border-[#D1D9D0]"
                    : "bg-[#0C100D]/80 border-[#243026]"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span
                    className={`text-[11px] shrink-0 ${
                      isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                    }`}
                  >
                    {evt.time}
                  </span>
                  <span
                    className={`font-semibold truncate max-w-[130px] sm:max-w-xs md:max-w-md ${
                      isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                    }`}
                    title={evt.event}
                  >
                    {evt.event}
                  </span>
                  <span className={`text-[10px] font-bold shrink-0 ${statusColor(evt.status)}`}>
                    {evt.status}
                  </span>
                </div>
                <span
                  className={`font-bold text-[11px] shrink-0 ml-2 ${
                    isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                  }`}
                >
                  {evt.latency}ms
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
