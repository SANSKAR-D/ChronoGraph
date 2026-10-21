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

export function ArchitectureView() {
  const [selectedSpec, setSelectedSpec] = useState<"dag" | "lua" | "worker" | "sse">("dag");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:pt-28 sm:px-6 lg:px-8 space-y-8">
      {/* Architecture Header */}
      <div>
        <h2 className="text-xl font-bold text-zinc-200 tracking-tight">System Architecture & Engine Specs</h2>
        <p className="text-xs text-zinc-400 font-medium">
          Formal execution mechanics: Kahn's DAG sorting, atomic Redis Lua fan-out, and BullMQ worker resilience.
        </p>
      </div>

      {/* Spec Selector */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-4">
        <button
          onClick={() => setSelectedSpec("dag")}
          type="button"
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
            selectedSpec === "dag"
              ? "bg-zinc-100 text-zinc-950 shadow-md shadow-black/30"
              : "liquid-glass text-zinc-200 hover:bg-zinc-900/80 border border-zinc-800"
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span>1. Kahn's Cycle Detection</span>
        </button>

        <button
          onClick={() => setSelectedSpec("lua")}
          type="button"
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
            selectedSpec === "lua"
              ? "bg-zinc-100 text-zinc-950 shadow-md shadow-black/30"
              : "liquid-glass text-zinc-200 hover:bg-zinc-900/80 border border-zinc-800"
          }`}
        >
          <Database className="h-4 w-4" />
          <span>2. Redis Lua Fan-Out</span>
        </button>

        <button
          onClick={() => setSelectedSpec("worker")}
          type="button"
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
            selectedSpec === "worker"
              ? "bg-zinc-100 text-zinc-950 shadow-md shadow-black/30"
              : "liquid-glass text-zinc-200 hover:bg-zinc-900/80 border border-zinc-800"
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>3. BullMQ Worker Pool</span>
        </button>

        <button
          onClick={() => setSelectedSpec("sse")}
          type="button"
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
            selectedSpec === "sse"
              ? "bg-zinc-100 text-zinc-950 shadow-md shadow-black/30"
              : "liquid-glass text-zinc-200 hover:bg-zinc-900/80 border border-zinc-800"
          }`}
        >
          <Network className="h-4 w-4" />
          <span>4. SSE Streaming Pipeline</span>
        </button>
      </div>

      {/* Selected Specification Details (Liquid Glass Card) */}
      <div className="liquid-glass rounded-2xl p-6 space-y-4 border border-zinc-800">
        {selectedSpec === "dag" && (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="font-bold text-zinc-200">Topological In-Degree & 3-Color DFS Guard</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Before any workflow is accepted or executed, the blueprint is validated against both Kahn's
              algorithm (for in-degree queue seeding) and a 3-color DFS (WHITE, GRAY, BLACK) to return the
              exact cyclic path for canvas highlighting.
            </p>
            <div className="rounded-xl bg-zinc-900/70 p-4 border border-zinc-800 font-mono text-xs text-zinc-200 overflow-x-auto shadow-xs">
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
            <div className="flex items-center gap-2 text-zinc-400">
              <Database className="h-5 w-5" />
              <h3 className="font-bold text-zinc-200">Atomic In-Degree Decrement via Redis Lua</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              When parallel parent nodes finish, they atomic decrements the downstream child node's
              in-degree counter in Redis. When the counter hits exactly 0, the child is enqueued.
            </p>
            <div className="rounded-xl bg-zinc-900/70 p-4 border border-zinc-800 font-mono text-xs text-zinc-200 overflow-x-auto shadow-xs">
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
            <div className="flex items-center gap-2 text-zinc-400">
              <Cpu className="h-5 w-5" />
              <h3 className="font-bold text-zinc-200">BullMQ Worker Pool & Full Jitter Backoff</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Standalone worker processes consume node execution jobs with configurable concurrency and
              heartbeat emission (<code>worker:heartbeat:workerId</code>). Retries use exponential backoff with full
              jitter to prevent thundering herd problems.
            </p>
            <div className="rounded-xl bg-zinc-900/70 p-4 border border-zinc-800 font-mono text-xs text-zinc-200 overflow-x-auto shadow-xs">
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
            <div className="flex items-center gap-2 text-zinc-400">
              <Network className="h-5 w-5" />
              <h3 className="font-bold text-zinc-200">High-Throughput SSE Streaming Pipeline</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Workers publish events (\`RUNNING\`, \`RETRYING\`, \`SUCCESS\`, \`DLQ\`) to Redis channels.
              Next.js SSE route pipes Pub/Sub directly to browser EventSource connections.
            </p>
            <div className="rounded-xl bg-zinc-900/70 p-4 border border-zinc-800 font-mono text-xs text-zinc-200 overflow-x-auto shadow-xs">
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
