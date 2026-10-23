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

export function DLQView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";
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
        <div
          className={`liquid-glass flex items-center gap-2.5 rounded-xl border p-3 text-xs shadow-lg animate-in fade-in slide-in-from-top-2 ${
            isLight
              ? "border-[#7FBF6A]/40 bg-[#FAFAF9]/95 text-[#141A15]"
              : "border-[#7FBF6A]/40 bg-[#141A15]/95 text-[#E8ECE4]"
          }`}
        >
          <CheckCircle className="h-4 w-4 text-[#7FBF6A] shrink-0" />
          <span className="font-semibold">{notification}</span>
        </div>
      )}

      {/* DLQ Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className={`text-xl font-bold tracking-tight ${
                isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
              }`}
            >
              Dead-Letter Queue (DLQ)
            </h2>
            <span className="rounded-full bg-[#E5735C]/15 px-2.5 py-0.5 text-xs font-mono font-bold text-[#E5735C] border border-[#E5735C]/30 shadow-[0_0_12px_rgba(229,115,92,0.2)]">
              {jobs.filter((j) => j.status === "pending").length} Unresolved
            </span>
          </div>
          <p
            className={`text-xs font-medium mt-0.5 ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            Jobs that exceeded retry limits under exponential backoff with full jitter.
          </p>
        </div>

        <button
          onClick={replayAll}
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-[#E5735C] hover:bg-[#d6654e] px-4 py-2 text-xs font-bold text-[#0C100D] transition-all cursor-pointer shadow-md shadow-[#E5735C]/25 active:scale-95"
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
                ? "border-[#7FBF6A]/35 bg-[#7FBF6A]/10 opacity-75"
                : isLight
                ? "border-[#D1D9D0] bg-[#FAFAF9]/90 hover:border-[#E5735C]/50 shadow-sm"
                : "border-[#243026] bg-[#141A15]/80 hover:border-[#E5735C]/50 shadow-md"
            }`}
          >
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold ${
                      isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                    }`}
                  >
                    {job.id}
                  </span>
                  <span className={isLight ? "text-[#D1D9D0]" : "text-[#243026]"}>•</span>
                  <span
                    className={`text-xs font-medium ${
                      isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                    }`}
                  >
                    {job.workflow}
                  </span>
                  <span className={isLight ? "text-[#D1D9D0]" : "text-[#243026]"}>•</span>
                  <span
                    className={`font-mono text-[11px] ${
                      isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                    }`}
                  >
                    {job.timestamp}
                  </span>
                </div>
                <p className="text-xs font-mono text-[#E5735C] font-bold">{job.failedNode}</p>
                <div
                  className={`rounded-xl p-3 font-mono text-xs mt-2 border ${
                    isLight
                      ? "bg-[#ECEFEA] border-[#D1D9D0] text-[#C8533D]"
                      : "bg-[#0C100D]/90 border-[#243026] text-[#E5735C]"
                  }`}
                >
                  {job.lastError}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2.5">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium border ${
                    isLight
                      ? "bg-[#E2E6E3] border-[#D1D9D0] text-[#141A15]"
                      : "bg-[#0C100D]/80 border-[#243026] text-[#E8ECE4]"
                  }`}
                >
                  Attempts: {job.attempts}/{job.maxAttempts}
                </span>

                {job.status === "replayed" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#7FBF6A] font-semibold">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Re-injected
                  </span>
                ) : (
                  <button
                    onClick={() => replayJob(job.id)}
                    disabled={job.status === "replaying"}
                    type="button"
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                      isLight
                        ? "border-[#D1D9D0] bg-white text-[#141A15] hover:border-[#7FBF6A] hover:text-[#548A44] shadow-xs active:scale-95"
                        : "border-[#243026] bg-[#0C100D] text-[#E8ECE4] hover:border-[#7FBF6A]/60 hover:text-[#7FBF6A] shadow-xs active:scale-95"
                    }`}
                  >
                    <RotateCw
                      className={`h-3 w-3 ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      } ${job.status === "replaying" ? "animate-spin text-[#7FBF6A]" : ""}`}
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
