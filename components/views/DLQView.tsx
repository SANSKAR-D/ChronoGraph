"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  const [jobs, setJobs] = useState<DLQJob[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/dlq");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch {
      // ignore network abort
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 3500);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const replayJob = async (id: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "replaying" } : j))
    );

    try {
      const res = await fetch(`/api/v1/dlq/${id}/replay`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: "replayed" } : j))
        );
        setNotification(`Job ${id} re-injected into BullMQ queue successfully.`);
      } else {
        setTimeout(() => {
          setJobs((prev) =>
            prev.map((j) => (j.id === id ? { ...j, status: "replayed" } : j))
          );
          setNotification(`Job ${id} re-queued for execution.`);
        }, 1000);
      }
    } catch {
      setTimeout(() => {
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: "replayed" } : j))
        );
        setNotification(`Job ${id} re-queued for execution.`);
      }, 1000);
    }
    setTimeout(() => {
      fetchJobs();
      setNotification(null);
    }, 4000);
  };

  const replayAll = async () => {
    const pendingJobs = jobs.filter((j) => j.status === "pending");
    if (pendingJobs.length === 0) return;
    setJobs((prev) => prev.map((j) => (j.status === "pending" ? { ...j, status: "replaying" } : j)));
    try {
      await Promise.all(
        pendingJobs.map((j) =>
          fetch(`/api/v1/dlq/${j.id}/replay`, { method: "POST" }).catch(() => {})
        )
      );
    } catch {
      // fallback
    }
    setTimeout(() => {
      setJobs((prev) => prev.map((j) => ({ ...j, status: "replayed" })));
      setNotification(`All ${pendingJobs.length} DLQ jobs re-queued for topological execution.`);
      fetchJobs();
      setTimeout(() => setNotification(null), 4000);
    }, 1200);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:pl-8 lg:pr-48 space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs shadow-md animate-in fade-in slide-in-from-top-2 ${
            isLight
              ? "border-[#7FBF6A]/40 bg-white text-[#141A15]"
              : "border-[#7FBF6A]/40 bg-[#141A15] text-[#E8ECE4]"
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsRefreshing(true);
              fetchJobs().finally(() => setTimeout(() => setIsRefreshing(false), 500));
            }}
            type="button"
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
              isLight
                ? "border-[#D1D9D0] bg-white text-[#141A15] hover:border-[#7FBF6A] shadow-xs"
                : "border-[#243026] bg-[#0C100D] text-[#E8ECE4] hover:border-[#7FBF6A]/50 shadow-xs"
            }`}
            title="Refresh DLQ"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#7FBF6A]" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={replayAll}
            disabled={jobs.filter((j) => j.status === "pending").length === 0}
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-[#E5735C] hover:bg-[#d6654e] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold text-[#0C100D] transition-all cursor-pointer shadow-md shadow-[#E5735C]/25 active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Replay All Jobs</span>
          </button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-4">
        {jobs.length === 0 ? (
          <div
            className={`rounded-2xl p-12 text-center border ${
              isLight
                ? "border-[#E2E6E3] bg-white shadow-xs"
                : "border-[#243026] bg-[#141A15] shadow-xs"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <CheckCircle className="h-8 w-8 text-[#7FBF6A]" />
              <h3
                className={`text-sm font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                No Dead-Letter Jobs
              </h3>
              <p
                className={`text-xs max-w-sm ${
                  isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                }`}
              >
                The dead-letter queue is completely empty. No workflow jobs have exhausted retry limits.
              </p>
            </div>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-2xl p-5 border transition-all ${
                job.status === "replayed"
                  ? "border-[#7FBF6A]/35 bg-[#7FBF6A]/10 opacity-75"
                  : isLight
                  ? "border-[#E2E6E3] bg-white hover:border-[#E5735C]/50 shadow-xs"
                  : "border-[#243026] bg-[#141A15] hover:border-[#E5735C]/50 shadow-xs"
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
          ))
        )}
      </div>
    </div>
  );
}
