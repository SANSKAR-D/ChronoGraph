"use client";

import React, { useState, useEffect } from "react";
import { Activity, Server, RefreshCw, Radio } from "lucide-react";
import { CronSchedulersPanel } from "@/components/telemetry/CronSchedulersPanel";

interface WorkerNode {
  id: string; name: string; status: "healthy" | "busy";
  concurrency: number; cpu: number; memory: string; lastHeartbeat: string;
}

export function TelemetryView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";
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
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:px-8 space-y-8">
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
              ? "border-[#D1D9D0] bg-white text-[#141A15] hover:border-[#7FBF6A] shadow-xs active:scale-95"
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
            value: "12",
            color: isLight ? "text-[#141A15]" : "text-[#E8ECE4]",
            bar: "bg-[#8B968B] w-[25%]",
          },
          {
            label: "Active Executing",
            value: "4",
            color: "text-[#7FBF6A]",
            bar: "bg-[#7FBF6A] w-[40%] shadow-[0_0_8px_rgba(127,191,106,0.4)]",
          },
          {
            label: "Delayed Transitions",
            value: "2",
            color: "text-[#E5B86A]",
            bar: "bg-[#E5B86A] w-[15%]",
          },
          {
            label: "Dead Letter Jobs",
            value: "3",
            color: "text-[#E5735C]",
            bar: "bg-[#E5735C] w-[10%] shadow-[0_0_8px_rgba(229,115,92,0.4)]",
          },
        ].map(({ label, value, color, bar }) => (
          <div
            key={label}
            className={`liquid-glass rounded-2xl p-4 border transition-all ${
              isLight
                ? "border-[#D1D9D0] bg-[#FAFAF9]/90 shadow-sm"
                : "border-[#243026] bg-[#141A15]/80 shadow-md"
            }`}
          >
            <div className="relative z-10">
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
        className={`liquid-glass rounded-2xl overflow-hidden border ${
          isLight
            ? "border-[#D1D9D0] bg-[#FAFAF9]/90 shadow-sm"
            : "border-[#243026] bg-[#141A15]/80 shadow-md"
        }`}
      >
        <div
          className={`relative z-10 p-4 border-b flex items-center justify-between ${
            isLight ? "border-[#D1D9D0] bg-white/40" : "border-[#243026] bg-[#0C100D]/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#7FBF6A]" />
            <h3
              className={`text-sm font-bold ${
                isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
              }`}
            >
              Active Worker Pool (4 Nodes)
            </h3>
          </div>
          <span
            className={`text-[11px] font-mono font-medium ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            Auto-balanced concurrency
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
              {workers.map((w) => (
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
                    {w.concurrency} / 10 jobs
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SSE Real-Time Stream */}
      <div
        className={`liquid-glass rounded-2xl p-5 border ${
          isLight
            ? "border-[#D1D9D0] bg-[#FAFAF9]/90 shadow-sm"
            : "border-[#243026] bg-[#141A15]/80 shadow-md"
        }`}
      >
        <div
          className={`relative z-10 flex items-center justify-between pb-3 border-b ${
            isLight ? "border-[#D1D9D0]" : "border-[#243026]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#7FBF6A]" />
            <span
              className={`text-sm font-bold ${
                isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
              }`}
            >
              Live Event Stream (`/api/v1/runs/stream`)
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
          {events.map((evt) => (
            <div
              key={evt.id}
              className={`flex items-center justify-between font-mono text-xs p-2.5 rounded-xl border ${
                isLight
                  ? "bg-[#ECEFEA] border-[#D1D9D0]"
                  : "bg-[#0C100D]/80 border-[#243026]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] ${
                    isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                  }`}
                >
                  {evt.time}
                </span>
                <span
                  className={`font-semibold ${
                    isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                  }`}
                >
                  {evt.event}
                </span>
                <span className={`text-[10px] font-bold ${statusColor(evt.status)}`}>
                  {evt.status}
                </span>
              </div>
              <span
                className={`font-bold text-[11px] ${
                  isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                }`}
              >
                {evt.latency}ms
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
