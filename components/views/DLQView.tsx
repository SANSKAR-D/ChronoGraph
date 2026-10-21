"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  RotateCw,
  Clock,
  CheckCircle,
  FileText,
  ShieldAlert,
  ChevronRight,
  Zap,
} from "lucide-react";

interface DLQJob {
  id: string;
  runId: string;
  workflow: string;
  failedNode: string;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  timestamp: string;
  status: "pending" | "replaying" | "replayed";
}

export function DLQView() {
  const [jobs, setJobs] = useState<DLQJob[]>([
    {
      id: "dlq_job_8911",
      runId: "run_diamond_78a1",
      workflow: "Diamond Payment Settlement",
      failedNode: "executeHttpNode (Stripe Auth)",
      attempts: 3,
      maxAttempts: 3,
      lastError: "HTTP 503 upstream gateway timeout after 5000ms",
      timestamp: "11:18:42",
      status: "pending",
    },
    {
      id: "dlq_job_8912",
      runId: "run_flaky_90c2",
      workflow: "Chaos Flaky API Pipeline",
      failedNode: "executeHttpNode (Inventory Service)",
      attempts: 4,
      maxAttempts: 4,
      lastError: "ECONNRESET connection closed by foreign host",
      timestamp: "11:19:15",
      status: "pending",
    },
    {
      id: "dlq_job_8913",
      runId: "run_sync_33d4",
      workflow: "Cron Data Sync Pipeline",
      failedNode: "executeTransformNode (User Mapping)",
      attempts: 3,
      maxAttempts: 3,
      lastError: "SyntaxError: Unexpected token '<' in JSON at position 0",
      timestamp: "11:19:50",
      status: "pending",
    },
  ]);

  const [notification, setNotification] = useState<string | null>(null);

  const replayJob = (id: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "replaying" } : j))
    );

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: "replayed" } : j))
      );
      setNotification(`Job ${id} re-injected into BullMQ queue successfully.`);
      setTimeout(() => setNotification(null), 4000);
    }, 1200);
  };

  const replayAll = () => {
    setJobs((prev) => prev.map((j) => ({ ...j, status: "replaying" })));
    setTimeout(() => {
      setJobs((prev) => prev.map((j) => ({ ...j, status: "replayed" })));
      setNotification(`All 3 DLQ jobs re-queued for topological execution.`);
      setTimeout(() => setNotification(null), 4000);
    }, 1500);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:px-8 space-y-6">
      {/* Toast Notification (Liquid Glass) */}
      {notification && (
        <div className="liquid-glass flex items-center gap-2 rounded-xl border border-emerald-500/30 p-3 text-xs text-zinc-200 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4 text-zinc-400" />
          <span className="font-semibold text-zinc-200">{notification}</span>
        </div>
      )}

      {/* DLQ Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-200 tracking-tight">Dead-Letter Queue (DLQ)</h2>
            <span className="rounded-full bg-[#E5735C]/15 px-2.5 py-0.5 text-xs font-bold text-[#E5735C] border border-[#E5735C]/30">
              {jobs.filter((j) => j.status === "pending").length} Unresolved
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-medium mt-0.5">
            Jobs that exceeded retry limits under exponential backoff with full jitter.
          </p>
        </div>

        <button
          onClick={replayAll}
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-[#E5735C] hover:bg-[#d6654e] px-4 py-2 text-xs font-semibold text-[#0C100D] transition cursor-pointer shadow-md shadow-[#E5735C]/20"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>Replay All Jobs</span>
        </button>
      </div>

      {/* Jobs List (Liquid Glass Cards) */}
      <div className="space-y-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`liquid-glass rounded-2xl p-5 border transition-all ${
              job.status === "replayed"
                ? "border-emerald-500/35 bg-emerald-500/10 opacity-75"
                : "border-zinc-800 hover:border-red-500/35"
            }`}
          >
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-200">{job.id}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-xs font-semibold text-zinc-400">{job.workflow}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="font-mono text-[11px] text-zinc-500">{job.timestamp}</span>
                </div>
                <p className="text-xs font-mono text-red-400 font-bold">{job.failedNode}</p>
                <div className="rounded-xl bg-zinc-900/70 p-3 font-mono text-xs text-zinc-200 border border-zinc-800 mt-2 shadow-xs">
                  {job.lastError}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 font-mono text-[11px] text-zinc-200 font-medium">
                  Attempts: {job.attempts}/{job.maxAttempts}
                </span>

                {job.status === "replayed" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400 font-semibold">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Re-injected
                  </span>
                ) : (
                  <button
                    onClick={() => replayJob(job.id)}
                    disabled={job.status === "replaying"}
                    type="button"
                    className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 transition cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <RotateCw
                      className={`h-3 w-3 text-zinc-400 ${job.status === "replaying" ? "animate-spin" : ""}`}
                    />
                    <span>{job.status === "replaying" ? "Replaying..." : "Replay Job"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
