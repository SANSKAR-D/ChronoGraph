"use client";

import React, { useState } from "react";
import {
  Cpu,
  Code2,
  Database,
  Network,
  ShieldCheck,
  Zap,
  GitBranch,
} from "lucide-react";

export function ArchitectureView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const isLight = theme === "light";
  const [selectedSpec, setSelectedSpec] = useState<"dag" | "lua" | "worker" | "sse">("dag");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:pl-8 lg:pr-48 space-y-8">
      {/* Architecture Header */}
      <div>
        <h2
          className={`text-xl font-bold tracking-tight ${
            isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
          }`}
        >
          System Architecture &amp; Engine Specs
        </h2>
        <p
          className={`text-xs font-medium mt-0.5 ${
            isLight ? "text-[#5E695E]" : "text-[#8B968B]"
          }`}
        >
          Formal execution mechanics: Kahn&apos;s DAG sorting, atomic Redis Lua fan-out, and BullMQ worker resilience.
        </p>
      </div>

      {/* Spec Selector */}
      <div
        className={`flex flex-wrap gap-2 border-b pb-4 ${
          isLight ? "border-[#D1D9D0]" : "border-[#243026]"
        }`}
      >
        {[
          { id: "dag", label: "1. Kahn's Cycle Detection", icon: GitBranch },
          { id: "lua", label: "2. Redis Lua Fan-Out", icon: Database },
          { id: "worker", label: "3. BullMQ Worker Pool", icon: Cpu },
          { id: "sse", label: "4. SSE Streaming Pipeline", icon: Network },
        ].map(({ id, label, icon: Icon }) => {
          const isSelected = selectedSpec === id;

          return (
            <button
              key={id}
              onClick={() => setSelectedSpec(id as typeof selectedSpec)}
              type="button"
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                isSelected
                  ? "bg-[#7FBF6A] text-[#0C100D] font-bold shadow-md shadow-[#7FBF6A]/25 border border-[#7FBF6A]"
                  : isLight
                  ? "border border-[#E2E6E3] bg-white text-[#5E695E] hover:text-[#141A15] hover:border-[#7FBF6A]"
                  : "border border-[#243026] text-[#8B968B] hover:text-[#E8ECE4] hover:border-[#7FBF6A]/50 bg-[#141A15]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Specification Details */}
      <div
        className={`rounded-2xl p-6 space-y-4 border ${
          isLight
            ? "border-[#E2E6E3] bg-white shadow-xs"
            : "border-[#243026] bg-[#141A15] shadow-xs"
        }`}
      >
        {selectedSpec === "dag" && (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#7FBF6A]" />
              <h3
                className={`font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                Topological In-Degree &amp; 3-Color DFS Guard
              </h3>
            </div>
            <p
              className={`text-xs leading-relaxed font-medium ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              Before any workflow is accepted or executed, the blueprint is validated against both Kahn&apos;s
              algorithm (for in-degree queue seeding) and a 3-color DFS (WHITE, GRAY, BLACK) to return the
              exact cyclic path for canvas highlighting.
            </p>
            <div
              className={`rounded-xl p-4 border font-mono text-xs overflow-x-auto ${
                isLight
                  ? "bg-[#ECEFEA] border-[#D1D9D0] text-[#141A15]"
                  : "bg-[#0C100D]/90 border-[#243026] text-[#E8ECE4]"
              }`}
            >
              <pre>{`// validateDAG(nodes, edges)
1. Initialize inDegree map for all nodes: inDegree[nodeId] = 0
2. For each edge (u -> v): inDegree[v]++
3. Root nodes with inDegree == 0 enter initial execution queue
4. If processedNodesCount < totalNodesCount => Graph contains a cycle!`}</pre>
            </div>
          </div>
        )}

        {selectedSpec === "lua" && (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#7FBF6A]" />
              <h3
                className={`font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                Atomic In-Degree Decrement via Redis Lua
              </h3>
            </div>
            <p
              className={`text-xs leading-relaxed font-medium ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              When parallel parent nodes finish, they atomic decrements the downstream child node&apos;s
              in-degree counter in Redis. When the counter hits exactly 0, the child is enqueued.
            </p>
            <div
              className={`rounded-xl p-4 border font-mono text-xs overflow-x-auto ${
                isLight
                  ? "bg-[#ECEFEA] border-[#D1D9D0] text-[#141A15]"
                  : "bg-[#0C100D]/90 border-[#243026] text-[#E8ECE4]"
              }`}
            >
              <pre>{`-- Atomic Fan-in Lua Script
local current = redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
if current == 0 then
    -- In-degree reached zero! Enqueue child node for worker execution
    redis.call('RPUSH', KEYS[2], ARGV[1])
    return 1
end
return 0`}</pre>
            </div>
          </div>
        )}

        {selectedSpec === "worker" && (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-[#7FBF6A]" />
              <h3
                className={`font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                BullMQ Worker Pool &amp; Full Jitter Backoff
              </h3>
            </div>
            <p
              className={`text-xs leading-relaxed font-medium ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              Standalone worker processes consume node execution jobs with configurable concurrency and
              heartbeat emission (<code>worker:heartbeat:workerId</code>). Retries use exponential backoff with full
              jitter to prevent thundering herd problems.
            </p>
            <div
              className={`rounded-xl p-4 border font-mono text-xs overflow-x-auto ${
                isLight
                  ? "bg-[#ECEFEA] border-[#D1D9D0] text-[#141A15]"
                  : "bg-[#0C100D]/90 border-[#243026] text-[#E8ECE4]"
              }`}
            >
              <pre>{`// Exponential Backoff with Full Jitter
const backoff = (attempt: number, base = 200, cap = 10000) => {
  const temp = Math.min(cap, base * Math.pow(2, attempt));
  return Math.floor(Math.random() * temp);
};`}</pre>
            </div>
          </div>
        )}

        {selectedSpec === "sse" && (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-[#7FBF6A]" />
              <h3
                className={`font-bold ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                High-Throughput SSE Streaming Pipeline
              </h3>
            </div>
            <p
              className={`text-xs leading-relaxed font-medium ${
                isLight ? "text-[#5E695E]" : "text-[#8B968B]"
              }`}
            >
              Workers publish events (<code>RUNNING</code>, <code>RETRYING</code>, <code>SUCCESS</code>, <code>DLQ</code>) to Redis channels.
              Next.js SSE route pipes Pub/Sub directly to browser EventSource connections.
            </p>
            <div
              className={`rounded-xl p-4 border font-mono text-xs overflow-x-auto ${
                isLight
                  ? "bg-[#ECEFEA] border-[#D1D9D0] text-[#141A15]"
                  : "bg-[#0C100D]/90 border-[#243026] text-[#E8ECE4]"
              }`}
            >
              <pre>{`// GET /api/v1/runs/[runId]/stream
return new Response(readableStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  }
});`}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
