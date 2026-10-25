"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Play,
  Trash2,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
} from "lucide-react";

interface CronSchedulerItem {
  schedulerId: string;
  workflowId: string;
  workflowName: string;
  description?: string | null;
  cronExpression: string;
  timezone?: string;
  isActive: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  totalRunsCount: number;
}

export function CronSchedulersPanel({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";
  const [schedulers, setSchedulers] = useState<CronSchedulerItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form state for scheduling
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [cronPattern, setCronPattern] = useState<string>("*/5 * * * *");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Triggering state per schedulerId
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const fetchSchedulers = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/v1/cron/schedulers");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.schedulers)) {
        setSchedulers(json.schedulers);
        if (json.schedulers.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(json.schedulers[0].workflowId);
        }
      }
    } catch {
      // Ignore transient network aborts during Next.js reload/restart
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedWorkflowId]);

  useEffect(() => {
    fetchSchedulers();
    // Auto poll every 10 seconds for real-time schedule alignment
    const timer = setInterval(fetchSchedulers, 10000);
    return () => clearInterval(timer);
  }, [fetchSchedulers]);

  const handleTriggerNow = async (workflowId: string, name: string) => {
    try {
      setTriggeringId(workflowId);
      setActionMessage(null);
      const res = await fetch("/api/v1/cron/trigger-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: `Triggered "${name}" successfully! Run ID: ${data.runId} (Trigger: CRON)`,
          type: "success",
        });
        fetchSchedulers();
      } else {
        setActionMessage({
          text: `Failed to trigger: ${data.error}`,
          type: "error",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({ text: `Execution failed: ${msg}`, type: "error" });
    } finally {
      setTriggeringId(null);
    }
  };

  const handleRemoveScheduler = async (workflowId: string, name: string) => {
    try {
      setActionMessage(null);
      const res = await fetch("/api/v1/cron/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: `Unregistered repeatable scheduler for "${name}" from BullMQ.`,
          type: "success",
        });
        fetchSchedulers();
      } else {
        setActionMessage({ text: data.error || "Failed to remove scheduler", type: "error" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({ text: `Remove failed: ${msg}`, type: "error" });
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflowId || !cronPattern) return;

    try {
      setIsSubmitting(true);
      setActionMessage(null);
      const res = await fetch("/api/v1/cron/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: selectedWorkflowId,
          cronExpression: cronPattern,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: `Successfully registered BullMQ repeatable job with pattern "${cronPattern}"!`,
          type: "success",
        });
        setShowAddForm(false);
        fetchSchedulers();
      } else {
        setActionMessage({
          text: `Scheduling failed: ${data.error}`,
          type: "error",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({ text: `Error: ${msg}`, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden border ${
        isLight
          ? "border-[#E2E6E3] bg-white shadow-xs"
          : "border-[#243026] bg-[#141A15] shadow-xs"
      }`}
    >
      {/* Panel Header */}
      <div
        className={`p-5 border-b flex flex-wrap items-center justify-between gap-4 ${
          isLight ? "border-[#E2E6E3] bg-[#F7F9F6]" : "border-[#243026] bg-[#0C100D]/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7FBF6A]/10 border border-[#7FBF6A]/20 text-[#7FBF6A]">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                BullMQ Repeatable Cron Schedulers
              </h3>
              <span className="rounded-full bg-[#7FBF6A]/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-[#7FBF6A] border border-[#7FBF6A]/30">
                Phase 2 // T2.5 Live
              </span>
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              Workflows triggered deterministically via BullMQ <code className="text-[#7FBF6A] font-mono">queue.upsertJobScheduler</code> on Redis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSchedulers}
            disabled={isRefreshing}
            type="button"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition cursor-pointer ${
              isLight
                ? "border-[#D1D9D0] bg-white text-[#141A15] hover:border-[#7FBF6A]"
                : "border-[#243026] bg-[#0C100D] text-[#8B968B] hover:text-[#E8ECE4] hover:border-[#7FBF6A]/40"
            }`}
            title="Refresh BullMQ Schedulers"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#7FBF6A]" : ""}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-[#7FBF6A] bg-[#7FBF6A] hover:bg-[#92CF7D] px-3.5 py-1.5 text-xs font-mono font-bold text-[#0C100D] transition-all cursor-pointer shadow-[0_0_15px_rgba(127,191,106,0.25)] active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showAddForm ? "Close Form" : "Schedule Workflow"}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`px-5 py-3 text-xs font-mono flex items-center justify-between border-b ${
            actionMessage.type === "success"
              ? "bg-[#7FBF6A]/10 border-[#7FBF6A]/30 text-[#7FBF6A]"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline opacity-70 hover:opacity-100 cursor-pointer ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add / Schedule Workflow Form Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleCreateOrUpdate}
          className={`p-5 border-b space-y-4 ${
            isLight
              ? "border-[#D1D9D0] bg-[#F3F6F2]"
              : "border-[#243026] bg-[#0C100D]/70"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold ${
              isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
            }`}
          >
            <Calendar className="h-4 w-4 text-[#7FBF6A]" />
            <span>Register BullMQ Repeatable Job Scheduler</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={`block text-[11px] font-mono mb-1 ${
                  isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                }`}
              >
                Workflow Blueprint (UUID or Select)
              </label>
              <input
                type="text"
                required
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                placeholder="e.g. 9b2156d7-0162-4290-..."
                className={`w-full rounded-xl border px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-[#7FBF6A] ${
                  isLight
                    ? "border-[#D1D9D0] bg-white text-[#141A15]"
                    : "border-[#243026] bg-[#141A15] text-[#E8ECE4]"
                }`}
              />
            </div>

            <div>
              <label
                className={`block text-[11px] font-mono mb-1 ${
                  isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                }`}
              >
                Standard 5-Field Cron Pattern
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={cronPattern}
                  onChange={(e) => setCronPattern(e.target.value)}
                  placeholder="*/5 * * * *"
                  className={`flex-1 rounded-xl border px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-[#7FBF6A] ${
                    isLight
                      ? "border-[#D1D9D0] bg-white text-[#141A15]"
                      : "border-[#243026] bg-[#141A15] text-[#E8ECE4]"
                  }`}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl border border-[#7FBF6A] bg-[#7FBF6A] hover:bg-[#92CF7D] px-4 py-2 text-xs font-mono font-bold text-[#0C100D] transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isSubmitting ? "Registering..." : "Upsert Schedule"}
                </button>
              </div>
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            <span>Presets:</span>
            {[
              { label: "Every 1 min", val: "* * * * *" },
              { label: "Every 5 mins", val: "*/5 * * * *" },
              { label: "Every 15 mins", val: "*/15 * * * *" },
              { label: "Hourly", val: "0 * * * *" },
              { label: "Daily @ Midnight", val: "0 0 * * *" },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => setCronPattern(p.val)}
                className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  isLight
                    ? "border-[#D1D9D0] bg-white text-[#141A15] hover:border-[#7FBF6A]"
                    : "border-[#243026] bg-[#141A15] text-[#8B968B] hover:border-[#7FBF6A]/50 hover:text-[#E8ECE4]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </form>
      )}

      {/* Active Schedulers List */}
      <div className="p-5">
        {isLoading ? (
          <div
            className={`py-8 text-center text-xs font-mono ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            Loading BullMQ schedulers from Redis...
          </div>
        ) : schedulers.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p
              className={`text-xs font-mono ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              No active repeatable BullMQ schedulers found.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[#7FBF6A] hover:underline font-mono cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Schedule your first recurring workflow</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedulers.map((job) => {
              const isTriggering = triggeringId === job.workflowId;

              return (
                <div
                  key={job.schedulerId}
                  className={`rounded-xl border p-4 transition-all flex flex-wrap items-center justify-between gap-4 ${
                    isLight
                      ? "border-[#D1D9D0] bg-white hover:border-[#7FBF6A]/60 shadow-xs"
                      : "border-[#243026] bg-[#0C100D]/70 hover:border-[#7FBF6A]/40 shadow-xs"
                  }`}
                >
                  {/* Left: Workflow & Cron Details */}
                  <div className="space-y-1.5 min-w-[280px]">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-[#7FBF6A] animate-pulse" />
                      <h4
                        className={`text-sm font-bold ${
                          isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                        }`}
                      >
                        {job.workflowName}
                      </h4>
                      <span className="rounded bg-[#7FBF6A]/15 border border-[#7FBF6A]/30 px-2 py-0.5 text-[10px] font-mono font-semibold text-[#7FBF6A]">
                        {job.cronExpression}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] font-mono max-w-xl ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      }`}
                    >
                      {job.description || `Scheduler ID: ${job.schedulerId}`}
                    </p>

                    <div
                      className={`flex flex-wrap items-center gap-3 text-[10px] font-mono pt-1 ${
                        isLight ? "text-[#5E695E]" : "text-[#8B968B]"
                      }`}
                    >
                      <span>
                        Next Run:{" "}
                        <strong
                          className={isLight ? "text-[#141A15]" : "text-[#E8ECE4]"}
                        >
                          {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "Pending"}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Total Runs: <strong className="text-[#7FBF6A]">{job.totalRunsCount}</strong>
                      </span>
                      <span>•</span>
                      <span>Timezone: {job.timezone || "UTC"}</span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTriggerNow(job.workflowId, job.workflowName)}
                      disabled={isTriggering}
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg border border-[#7FBF6A] bg-[#7FBF6A]/15 hover:bg-[#7FBF6A] text-[#7FBF6A] hover:text-[#0C100D] px-3.5 py-1.5 text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                      title="Trigger workflow execution immediately via Cron Trigger runner"
                    >
                      <Play className={`h-3 w-3 fill-current ${isTriggering ? "animate-spin" : ""}`} />
                      <span>{isTriggering ? "Triggering..." : "Trigger Now"}</span>
                    </button>

                    <button
                      onClick={() => handleRemoveScheduler(job.workflowId, job.workflowName)}
                      type="button"
                      className={`flex items-center justify-center h-8 w-8 rounded-lg border transition-all cursor-pointer hover:text-[#E5735C] hover:border-[#E5735C]/40 hover:bg-[#E5735C]/10 active:scale-95 ${
                        isLight
                          ? "border-[#D1D9D0] text-[#5E695E] bg-white"
                          : "border-[#243026] text-[#8B968B] bg-[#0C100D]"
                      }`}
                      title="Unregister BullMQ Repeatable Job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Telemetry Note */}
      <div
        className={`px-5 py-3 border-t flex items-center justify-between text-[10px] font-mono ${
          isLight
            ? "border-[#E2E6E3] bg-[#F7F9F6] text-[#5E695E]"
            : "border-[#243026] bg-[#0C100D]/60 text-[#8B968B]"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-[#7FBF6A]" />
          <span>BullMQ v6 Repeatable Job Engine • Atomic Redis In-Degree Seeding</span>
        </div>
      </div>
    </div>
  );
}
