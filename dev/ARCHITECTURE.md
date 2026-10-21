# ChronoGraph — System Architecture & Engineering Specification
**Problem Statement:** M1 (04: The Dormammu Loop — Distributed DAG Workflow & Automation Engine)[cite: 8, 18]  
**Event:** CodeSangam 2026 // Webster[cite: 1, 2, 17]

---

## 1. High-Level System Topology

ChronoGraph strictly decouples **Visual Composition**, **API Trigger Ingestion**, **Topological State Coordination**, **Asynchronous Worker Execution**, and **Real-Time Telemetry Streaming** into isolated tiers[cite: 8, 18].

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT TIER (Next.js App Router)                          │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │  React Flow Canvas  │  │  Skiper / Kokonut UI │  │  Motion.dev 3D + SSE     │  │
│  │  (@xyflow/react)    │  │  Studio Shell & Dock │  │  Live Telemetry Listener │  │
│  └─────────┬───────────┘  └──────────┬───────────┘  └─────────────▲────────────┘  │
└────────────┼─────────────────────────┼────────────────────────────┼───────────────┘
             │ HTTPS REST (CRUD)       │ POST /api/v1/hooks/:id     │ EventSource (SSE)
             ▼                         ▼                            │ /api/v1/runs/:id/stream
┌───────────────────────────────────────────────────────────────────┴───────────────┐
│                     API GATEWAY & INGESTION LAYER (Node.js)                       │
│  • HMAC-SHA256 Webhook Auth & Sliding-Window Rate Limiter                         │
│  • Kahn's O(V + E) Acyclic Blueprint Verifier                                     │
│  • 202 Accepted Non-Blocking Trigger Valve (< 25ms p99)                           │
└────────────┬───────────────────────────────────────┬──────────────────────────────┘
             │ Prisma / Drizzle ORM                  │ ioredis (Lua Scripts + BullMQ)
             ▼                                       ▼
┌─────────────────────────────────────┐ ┌───────────────────────────────────────────┐
│     POSTGRESQL (Persistent DB)      │ │       REDIS 7+ (In-Memory Coordinator)    │
│  • workflow_blueprints (JSONB DAG)  │ │  • run:{id}:indegree (Hash: Node -> Int)  │
│  • workflow_runs (State Machine)    │ │  • run:{id}:outputs  (Hash: Node -> JSON) │
│  • node_execution_logs (Audit)      │ │  • lock:idem:{key}   (SET NX Idempotency) │
│  • dead_letter_records (DLQ Store)  │ │  • BullMQ ZSETs      (Delayed / Retries)  │
│                                     │ │  • channel:run:{id}  (Pub/Sub Telemetry)  │
└─────────────────────────────────────┘ └────────────────────┬──────────────────────┘
                                                             │ Job Claim & Heartbeat
                                                             ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                    STATELESS DISTRIBUTED WORKER POOL (BullMQ)                     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐  │
│  │  Worker Instance #1  │  │  Worker Instance #2  │  │  Worker Instance #N     │  │
│  │  (Concurrency: 20)   │  │  (Concurrency: 20)   │  │  (Heartbeat: 5000ms)    │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────────┬────────────┘  │
│             └─────────────────────────┼───────────────────────────┘               │
│                                       ▼                                           │
│       [HTTP Dispatch Executor]  [Isolated JSON Transform]  [ZSET Delay Timer]     │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │ On Exhausted Retries (Attempt == Max)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                       DEAD-LETTER QUEUE (DLQ) & REPLAY SINK                       │
└───────────────────────────────────────────────────────────────────────────────────┘