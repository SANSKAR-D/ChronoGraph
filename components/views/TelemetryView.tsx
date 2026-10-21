"use client";

import React, { useState, useEffect } from "react";
import { Activity, Server, RefreshCw, Radio } from "lucide-react";
import { CronSchedulersPanel } from "@/components/telemetry/CronSchedulersPanel";

interface WorkerNode {
  id: string; name: string; status: "healthy" | "busy";
  concurrency: number; cpu: number; memory: string; lastHeartbeat: string;
}

export function TelemetryView() {
  const [streamActive, setStreamActive] = useState(true);
  const [events, setEvents] = useState<Array<{ id: string; time: string; event: string; status: string; latency: number }>>([
    { id: "evt_101", time: "11:20:12", event: "JOB_COMPLETED",        status: "SUCCESS",   latency: 12 },
    { id: "evt_102", time: "11:20:13", event: "FAN_OUT_DECREMENT",    status: "RUNNING",   latency: 8 },
    { id: "evt_103", time: "11:20:14", event: "IDEMPOTENCY_ACQUIRED", status: "SUCCESS",   latency: 4 },
  ]);

  const [workers] = useState<WorkerNode[]>([
    { id: "worker-us-east-1", name: "dag-worker-01", status: "healthy", concurrency: 8,  cpu: 24, memory: "182 MB", lastHeartbeat: "Just now" },
    { id: "worker-us-east-2", name: "dag-worker-02", status: "busy",    concurrency: 10, cpu: 58, memory: "244 MB", lastHeartbeat: "1s ago" },
    { id: "worker-eu-west-1", name: "dag-worker-03", status: "healthy", concurrency: 6,  cpu: 31, memory: "196 MB", lastHeartbeat: "Just now" },
    { id: "worker-ap-south",  name: "dag-worker-04", status: "healthy", concurrency: 4,  cpu: 18, memory: "150 MB", lastHeartbeat: "2s ago" },
  ]);

  useEffect(() => {
    if (!streamActive) return;
    const interval = setInterval(() => {
      const picks = [
        { evt: "LUA_IN_DEGREE_DEC",   status: "SUCCESS" },
        { evt: "BULLMQ_DISPATCH",      status: "RUNNING" },
        { evt: "HTTP_NODE_RESOLVED",   status: "SUCCESS" },
        { evt: "WORKER_HEARTBEAT",     status: "HEARTBEAT" },
      ];
      const pick = picks[Math.floor(Math.random() * picks.length)];
      setEvents((prev) => [
        { id: `evt_${Date.now()}`, time: new Date().toLocaleTimeString(), event: pick.evt, status: pick.status, latency: Math.floor(Math.random() * 18 + 5) },
        ...prev.slice(0, 15),
      ]);
    }, 2500);
    return () => clearInterval(interval);
  }, [streamActive]);

  const statusColor = (s: string) =>
    s === "SUCCESS" ? "text-emerald-400" : s === "RUNNING" ? "text-indigo-400" : s === "HEARTBEAT" ? "text-amber-400" : "text-zinc-400";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Cluster Telemetry &amp; SSE Stream</h2>
          <p className="text-xs text-zinc-500 font-medium">Real-time cluster health, Redis Pub/Sub events, and BullMQ worker metrics.</p>
        </div>
        <button
          onClick={() => setStreamActive(!streamActive)}
          type="button"
          className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/60 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700/70 transition cursor-pointer"
        >
          <Radio className={`h-3.5 w-3.5 ${streamActive ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
          <span>{streamActive ? "Streaming Live" : "Stream Paused"}</span>
        </button>
      </div>

      {/* Queue Depth Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Waiting Jobs",        value: "12", color: "text-zinc-100", bar: "bg-zinc-600 w-[25%]" },
          { label: "Active Executing",    value: "4",  color: "text-emerald-400", bar: "bg-emerald-500 w-[40%]" },
          { label: "Delayed Transitions", value: "2",  color: "text-amber-400", bar: "bg-amber-500 w-[15%]" },
          { label: "Dead Letter Jobs",    value: "3",  color: "text-red-400",   bar: "bg-red-500 w-[10%]" },
        ].map(({ label, value, color, bar }) => (
          <div key={label} className="liquid-glass rounded-2xl p-4">
            <div className="relative z-10">
              <p className="text-xs font-semibold text-zinc-500">{label}</p>
              <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BullMQ Repeatable Cron Schedulers Panel (Task T2.5) */}
      <CronSchedulersPanel />

      {/* Worker Pool Table */}
      <div className="liquid-glass rounded-2xl overflow-hidden">
        <div className="relative z-10 p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-zinc-100">Active Worker Pool (4 Nodes)</h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 font-medium">Auto-balanced concurrency</span>
        </div>
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 text-zinc-500 font-mono text-[11px] border-b border-zinc-800">
              <tr>
                {["Worker ID", "Status", "Concurrency", "CPU Usage", "Memory", "Heartbeat"].map((h) => (
                  <th key={h} className="py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-zinc-800/30">
                  <td className="py-3 px-4 font-mono font-semibold text-zinc-200">{w.name}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                      w.status === "busy"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${w.status === "busy" ? "bg-amber-400" : "bg-emerald-400"}`} />
                      {w.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{w.concurrency} / 10 jobs</td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{w.cpu}%</td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{w.memory}</td>
                  <td className="py-3 px-4 text-emerald-400 text-[11px]">{w.lastHeartbeat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SSE Real-Time Stream */}
      <div className="liquid-glass rounded-2xl p-5">
        <div className="relative z-10 flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-bold text-zinc-200">Live Event Stream (`/api/v1/runs/stream`)</span>
          </div>
          <span className="font-mono text-[11px] text-zinc-500 font-semibold">SSE Chunked</span>
        </div>
        <div className="relative z-10 mt-3 space-y-2">
          {events.map((evt) => (
            <div key={evt.id} className="flex items-center justify-between font-mono text-xs p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-3">
                <span className="text-zinc-600 text-[11px]">{evt.time}</span>
                <span className="font-semibold text-zinc-200">{evt.event}</span>
                <span className={`text-[10px] font-bold ${statusColor(evt.status)}`}>{evt.status}</span>
              </div>
              <span className="text-zinc-500 font-bold text-[11px]">{evt.latency}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
