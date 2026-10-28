# ChronoGraph ⚡

> **High-Throughput, Distributed Topological Workflow Orchestrator & Live Telemetry Engine**  
> *Engineered with Next.js 15 (App Router), BullMQ, Redis 7 (Lua Scripting), PostgreSQL 16 (Prisma ORM), and React Flow.*

[![Next.js 15](https://img.shields.io/badge/Next.js-15.x-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-6.x-red?logo=redis)](https://bullmq.io/)
[![Redis](https://img.shields.io/badge/Redis-7--alpine-critical?logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16--alpine-blue?logo=postgresql)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Mathematical & Algorithmic Foundations](#-mathematical--algorithmic-foundations)
  - [1. Kahn's In-Degree Algorithm & 3-Color DFS Cycle Guard](#1-kahns-in-degree-algorithm--3-color-dfs-cycle-guard)
  - [2. Atomic Diamond Fan-In via Redis Lua Scripting](#2-atomic-diamond-fan-in-via-redis-lua-scripting)
  - [3. Exponential Backoff with Full Jitter Formula](#3-exponential-backoff-with-full-jitter-formula)
- [Quickstart Guide (Get Running in 3 Minutes)](#-quickstart-guide)
  - [Prerequisites](#prerequisites)
  - [Step 1: Start Infrastructure (Docker)](#step-1-start-infrastructure-docker)
  - [Step 2: Environment & Database Migration](#step-2-environment--database-migration)
  - [Step 3: Run the Web Application](#step-3-run-the-web-application)
  - [Step 4: Launch Distributed Workers / Autoscaler](#step-4-launch-distributed-workers--autoscaler)
- [Pre-Seeded Showcase Workflows](#-pre-seeded-showcase-workflows)
- [Feature Showcase & Interface Guide](#-feature-showcase--interface-guide)
  - [React Flow Studio Canvas & Workflow Management](#react-flow-studio-canvas--workflow-management)
  - [Real-Time SSE Telemetry & Health Stream](#real-time-sse-telemetry--health-stream)
  - [Celery-Style Worker Autoscaler](#celery-style-worker-autoscaler)
  - [Dead-Letter Queue (DLQ) & Fault Recovery](#dead-letter-queue-dlq--fault-recovery)
  - [BullMQ Repeatable Cron Job Scheduler](#bullmq-repeatable-cron-job-scheduler)
  - [Dual Theme System (Instrument Dark & Soothing Off-White)](#dual-theme-system)
- [API Reference](#-api-reference)
- [Load Testing & Benchmark Results](#-load-testing--benchmark-results)
- [Full Tool & Dependency Disclosures](#-full-tool--dependency-disclosures)
- [Project Directory Structure](#-project-directory-structure)

---

## 🔭 Overview

**ChronoGraph** is an enterprise-grade, distributed Directed Acyclic Graph (DAG) execution engine designed for high-throughput, low-latency background workflow orchestration. It solves the hard distributed systems problems that fragile workflow managers struggle with:

1. **Cycle Prevention at Blueprint Validation**: Graphs are mathematically verified via combined **3-Color DFS** and **Kahn's algorithm** before storage or execution.
2. **Sub-25ms Webhook Ingestion**: Webhooks return `202 Accepted` in $\approx 8\text{ ms}$, immediately offloading root nodes to BullMQ and Redis hashes.
3. **Diamond Dependency Resolution Without Race Conditions**: Parallel branches fan out and converge (fan-in) via a single-threaded **Redis Lua atomic in-degree decrement script**, preventing duplicate node executions.
4. **Full Jitter Resilience & Dead-Letter Queue (DLQ)**: Retries avoid the thundering herd problem using mathematically randomized exponential backoff. Failed jobs that exhaust retries are isolated in DLQ with complete diagnostic snapshots, one-click replay, and purge capabilities.
5. **Zero-Polling SSE Telemetry**: Worker state transitions (`RUNNING`, `RETRYING`, `SUCCESS`, `DLQ`) publish to Redis Pub/Sub channels piped directly to browser `EventSource` streams.
6. **Celery-Style Dynamic Autoscaling**: Automatically scales background worker child processes up and down based on real-time queue backlog with warm-down dampening.

---

## 🏛 System Architecture

The following diagram illustrates how incoming webhook triggers or cron events travel through the ingestion layer, atomic Redis state store, BullMQ distributed queues, worker processes, and live SSE telemetry:

<p align="center">
  <img src="public/ARCHITECTURE.svg" alt="ChronoGraph System Architecture" width="100%" />
</p>

---

## 🧮 Mathematical & Algorithmic Foundations

### 1. Kahn's In-Degree Algorithm & 3-Color DFS Cycle Guard

A valid workflow must be a **Directed Acyclic Graph** (DAG), defined as $G = (V, E)$ where vertices $V$ represent tasks (HTTP requests, data transforms, delays) and directed edges $E = \{(u, v)\}$ represent execution dependencies ($u \to v$ requires $u$ to succeed before $v$ starts).

ChronoGraph applies two complementary algorithms in `lib/dag/cycle-detector.ts`:

#### A. In-Degree Computation & Kahn's Topological Sort
For every vertex $v \in V$, the in-degree is defined as:
$$\text{in-degree}(v) = |\{u \in V \mid (u, v) \in E\}|$$

1. **Initialization**: Initialize $\text{in-degree}[v] = 0$ for all $v \in V$.
2. **Edge Traversal**: For each directed edge $(u, v) \in E$, increment $\text{in-degree}[v] \leftarrow \text{in-degree}[v] + 1$.
3. **Queue Seeding**: All vertices with $\text{in-degree}[v] = 0$ are root nodes (dependencies already satisfied) and enter the initial execution queue $Q$.
4. **Topological Order**: While $Q$ is not empty:
   - Dequeue $u \leftarrow Q$.
   - Append $u$ to $L$ (topological execution sequence).
   - For each outgoing neighbor $v$ of $u$:
     - Decrement $\text{in-degree}[v] \leftarrow \text{in-degree}[v] - 1$.
     - If $\text{in-degree}[v] == 0$, enqueue $v \to Q$.
5. **Cycle Detection Verdict**: If $|L| < |V|$, there exists at least one cycle, and the graph is rejected.

#### B. 3-Color DFS for Exact Cycle Extraction & UI Highlighting
To show the user the exact cycle path on the React Flow canvas (highlighted with animated red dashed edges), ChronoGraph implements 3-color Depth First Search:
- $\text{WHITE} = 0$: Unvisited node.
- $\text{GRAY} = 1$: Currently active in the recursive call stack (ancestor).
- $\text{BLACK} = 2$: Completely processed node and all descendants explored.

When a traversal from $u$ encounters a neighbor $v$ that is currently **GRAY**, a **back-edge** $(u, v)$ is proven. The cycle path is reconstructed:
$$\text{Cycle Path} = [v, \dots, u, v]$$
The canvas displays a cycle warning and prevents connecting the invalid edge.

---

### 2. Atomic Diamond Fan-In via Redis Lua Scripting

In real-world workflows, a common pattern is the **Diamond Dependency**:
```
        [ Trigger ]
          /     \
   [ Node A ]  [ Node B ]  (Parallel Fan-Out)
          \     /
       [ Node C ]          (Atomic Fan-In)
```
When `Node A` and `Node B` finish execution at the exact same millisecond on separate worker nodes, a classic **Read-Modify-Write Race Condition** occurs:
1. Worker A reads `in-degree(C) = 2`.
2. Worker B reads `in-degree(C) = 2`.
3. Worker A writes `in-degree(C) = 1`.
4. Worker B writes `in-degree(C) = 1`.
5. Neither worker observes `0`, causing `Node C` to **deadlock forever**, or both workers observe `0`, causing `Node C` to **execute twice**.

#### The ChronoGraph Lua Solution
ChronoGraph executes single-threaded, atomic Redis Lua script (`ATOMIC_FAN_OUT_LUA` in `lib/redis/lua-scripts.ts`):

```lua
-- Guard against duplicate parent completion
if redis.call("SISMEMBER", KEYS[2], ARGV[1]) == 1 then
    return {}
end
redis.call("SADD", KEYS[2], ARGV[1])
redis.call("EXPIRE", KEYS[2], 86400)

local unlockedChildren = {}
for i = 2, #ARGV do
    local childId = ARGV[i]
    local remaining = redis.call("HINCRBY", KEYS[1], childId, -1)
    if remaining == 0 then
        table.insert(unlockedChildren, childId)
    end
end

return unlockedChildren
```

**Guarantees**:
- **Zero Race Conditions**: Redis executes Lua atomically; no other command runs between reading and decrementing.
- **Single Enqueue Guarantee**: Exactly one worker receives `remaining == 0` for child $C$, guaranteeing **zero double-executions**.

---

### 3. Exponential Backoff with Full Jitter Formula

When a third-party HTTP service experiences intermittent rate limits or network blips, fixed or deterministic exponential retries cause the **Thundering Herd Problem**: thousands of retrying workers strike the target service at the exact same calculated millisecond intervals.

ChronoGraph implements the **Full Jitter** algorithm (developed by AWS Architecture):

$$T_{\text{wait}}(\text{attempt}) = \text{random}\left(0, \; \min\left(T_{\text{max}}, \; T_{\text{base}} \times 2^{\text{attempt}}\right)\right)$$

Where:
- $T_{\text{base}} = 200\text{ ms}$ (initial retry delay)
- $T_{\text{max}} = 10{,}000\text{ ms}$ (maximum ceiling)
- $\text{attempt} \in [1, \text{maxAttempts}]$

```typescript
// BullMQ custom backoff strategy in src/workers/dag-worker.ts
export function calculateFullJitterDelay(
  attempt: number,
  baseMs = 200,
  maxCapMs = 10000
): number {
  const exponentialCap = Math.min(maxCapMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponentialCap);
}
```

This distributes retry traffic evenly across the entire delay window, eliminating retry spikes and maximizing external API recovery rates.

---

## 🚀 Quickstart Guide

### Prerequisites
- **Node.js**: `v18.x`, `v20.x`, or `v22.x`
- **Docker & Docker Compose**: For PostgreSQL 16 and Redis 7
- **npm** or **pnpm**

---

### Step 1: Start Infrastructure (Docker)

Launch PostgreSQL and Redis in detached mode:

```bash
docker compose up -d
```

Verify that both containers are running and healthy:
```bash
docker compose ps
```
- `chronograph-postgres`: `localhost:5432`
- `chronograph-redis`: `localhost:6379`

---

### Step 2: Environment & Database Migration

1. Inspect or create the `.env` file (pre-configured for local docker):
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/chronograph?schema=public"
REDIS_URL="redis://localhost:6379"
WEBHOOK_SECRET="chronograph_secret_development_key_2026"
```

2. Push the Prisma schema and seed demo workflows:
```bash
npx prisma db push
npm run seed
```

---

### Step 3: Run the Web Application

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Step 4: Launch Distributed Workers / Autoscaler

Open a second terminal window to start the background worker process:

#### Option A: Celery-Style Autoscaler (Recommended)
Automatically scales worker concurrency and child processes based on queue depth:
```bash
npm run worker:autoscale
```

#### Option B: Standalone Worker Process
Runs a single worker process with fixed concurrency:
```bash
npm run worker
```

---

## 📦 Pre-Seeded Showcase Workflows

ChronoGraph comes with 3 pre-seeded demonstration blueprints:

| Blueprint Name | Architecture Topology | Primary Engineering Concept |
| :--- | :--- | :--- |
| **Diamond Payment Settlement** | `Trigger` $\to$ `[Validate, Fraud Check]` $\to$ `Settle Account` | Demonstrates parallel fan-out and **atomic fan-in via Redis Lua script** with zero race conditions. |
| **Chaos Flaky API Pipeline** | `Trigger` $\to$ `Flaky Payment Gateway` $\to$ `Notify User` | Simulates HTTP 503 errors, demonstrating **exponential backoff + full jitter**, automatic DLQ routing, and one-click replay. |
| **Cron Scheduled Data Sync** | `Cron Schedule (* * * * *)` $\to$ `Fetch DB` $\to$ `Transform JSON` $\to$ `Sync Warehouse` | Demonstrates BullMQ repeatable job schedulers, node template variable replacement (`{{node_1.data}}`), and automated execution. |

---

## 🎨 Feature Showcase & Interface Guide

### React Flow Studio Canvas & Workflow Management

- **Interactive Node Palette**: Drag-and-drop triggers, HTTP requests, data transformations, and non-blocking BullMQ delay nodes.
- **Node State Rings**: Real-time pulsing glow rings indicating execution states:
  - ⚪ `Idle` (Queued / Waiting for parent dependencies)
  - 🟢 `Running` (Actively processed by worker thread)
  - 🟡 `Retrying` (Enqueued with exponential backoff delay)
  - 🟢 `Success` (Execution log recorded in PostgreSQL)
  - 🔴 `DLQ` (Failed after exhausting retry cap)
- **Live Cycle Guard**: Validates DAG topology on connection; prevents circular loops with an animated red dashed line.
- **Workflow Save & Delete**:
  - Save existing or newly drawn workflows under custom names.
  - Delete workflows with a two-click confirmation modal that automatically unregisters BullMQ repeatable cron schedulers and cleans up cascading run histories in PostgreSQL.

### Real-Time SSE Telemetry & Health Stream

- Zero-polling architecture using Next.js `ReadableStream` and Redis Pub/Sub (`channel:cluster:events`).
- Live metrics tiles displaying **Waiting**, **Active**, **Delayed**, and **DLQ** counts.
- Dynamic worker pool table reporting per-worker CPU, memory, active concurrency, and heartbeat freshness.
- Streaming live event console with sub-millisecond timestamps.

### Celery-Style Worker Autoscaler

- Real-time monitor that measures queue pressure:
  $$\text{backlog} = \text{waitingJobs} + \text{delayedJobs}$$
  $$N_{\text{desired}} = \min\left(M_{\text{max}}, \; \max\left(M_{\text{min}}, \; \left\lceil \frac{\text{backlog}}{\text{threshold}} \right\rceil\right)\right)$$
- Features warm-down stabilization windows to prevent thrashing.
- Accessible directly via `npm run worker:autoscale` with live status broadcast to the Telemetry view.

### Dead-Letter Queue (DLQ) & Fault Recovery

- Automatically traps jobs that fail after exhausting all retry attempts.
- Downstream dependent nodes are safely set to `SKIPPED/HALTED` to protect downstream systems.
- **Inspection Drawer**: Full error messages, stack traces, and original JSON input payloads.
- **One-Click Replay**: Re-injects jobs back into the BullMQ topological queue.
- **Individual Deletion & Purge All**: Safely remove resolved or obsolete failure records.

### BullMQ Repeatable Cron Job Scheduler

- Manage periodic recurring workflow triggers powered by BullMQ's native `upsertJobScheduler`.
- Convenient workflow dropdown selector pairing human-readable names with workflow blueprints.
- Live countdown timers showing next scheduled execution times.
- One-click trigger execution and scheduler deletion.

### Dual Theme System

- **Instrument Dark Mode** (`#0C100D`): High-contrast, low-fatigue dark environment tailored for DevOps and platform engineers.
- **Soothing Off-White Light Mode** (`#FAFBF9` / `#F8FAF7`): Designed with an organic, instrument-grade off-white surface palette that avoids harsh pure white glare while maintaining clear visual hierarchy.

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/hooks/[webhookId]` | Triggers workflow run via webhook. Verifies HMAC header and returns `202 Accepted` in $< 25\text{ ms}$. |
| `GET` | `/api/v1/workflows` | Lists all workflow blueprints. |
| `POST` | `/api/v1/workflows` | Creates or saves a new workflow blueprint. |
| `DELETE` | `/api/v1/workflows/[workflowId]` | Deletes workflow, unregisters cron schedulers, and cascades run records. |
| `GET` | `/api/v1/cluster/health` | Returns cluster worker count, heartbeats, and queue statistics. |
| `GET` | `/api/v1/cluster/events` | SSE endpoint streaming cluster state transitions in real time. |
| `GET` | `/api/v1/cron/schedulers` | Lists all active BullMQ repeatable cron schedulers. |
| `POST` | `/api/v1/cron/schedulers` | Upserts a new cron schedule for a workflow. |
| `DELETE` | `/api/v1/cron/schedulers` | Removes an active repeatable job scheduler. |
| `GET` | `/api/v1/dlq` | Lists all dead-letter jobs with failure diagnostics. |
| `POST` | `/api/v1/dlq/[jobId]/replay` | Replays a failed job back into the execution queue. |
| `DELETE` | `/api/v1/dlq` | Purges all or selected DLQ records from database. |
| `GET` | `/api/v1/runs/[runId]/stream` | SSE endpoint streaming events for a specific workflow run. |

---

## 📊 Load Testing & Benchmark Results

ChronoGraph includes an automated high-concurrency benchmark script (`scripts/benchmark-load.ts`) designed to test ingestion throughput and verify zero double-execution guarantees.

Run the benchmark anytime:
```bash
npm run benchmark
```

### Benchmark Summary (200 Concurrent Webhook Ingestions)

| Metric | Target SLA | Benchmark Result | Status |
| :--- | :--- | :--- | :--- |
| **Concurrency** | 200 concurrent requests | **200 requests** | ✅ PASS |
| **Ingestion Latency (p50)** | $< 25.0\text{ ms}$ | **7.98 ms** | ✅ PASS |
| **Ingestion Latency (p90)** | $< 25.0\text{ ms}$ | **11.09 ms** | ✅ PASS |
| **Ingestion Latency (p95)** | $< 25.0\text{ ms}$ | **11.72 ms** | ✅ PASS |
| **Ingestion Latency (p99)** | $< 25.0\text{ ms}$ | **12.53 ms** | ✅ PASS |
| **Average Ingestion Latency** | $< 25.0\text{ ms}$ | **8.11 ms** | ✅ PASS |
| **Total Ingestion Duration** | - | **83.92 ms** | - |
| **Throughput Rate** | - | **2,383 requests/sec** | 🚀 High Speed |
| **Duplicate Executions** | 0 duplicates | **0 duplicates (100% unique)** | ✅ PROVEN |

---

## 🛠 Full Tool & Dependency Disclosures

In compliance with open-source attribution standards, the following libraries and architectural frameworks power ChronoGraph:

| Package / Technology | Version | Purpose in ChronoGraph |
| :--- | :--- | :--- |
| **`@xyflow/react`** | `^12.12.0` | Powers the interactive visual graph canvas, custom workflow node components, minimap, controls, and edge routing. |
| **`motion` (Framer Motion)** | `^14.4.0` | Delivers smooth micro-animations, slide-over drawers, liquid tab indicators, and 3D landing page tilt. |
| **`Skiper UI`** | Primitives | Aesthetic inspirations and clean interface primitives for dashboard and card layouts. |
| **`Kokonut UI`** | Primitives | Visual layout inspiration for high-density instrument-grade panels and metric counters. |
| **`react-aria-components`** | `^1.22.1` | Ensures accessible, keyboard-navigable navigation tabs, drawer dialogs, and form elements. |
| **`bullmq`** | `^6.4.0` | Distributed Redis-backed message queue handling priority scheduling, backoff delays, and repeatable cron jobs. |
| **`ioredis`** | `^6.0.0` | High-performance Redis client used for atomic Lua fan-in scripts, in-degree decrementing, and Pub/Sub streams. |
| **`PostgreSQL 16`** | `16-alpine` | ACID-compliant relational persistence for workflow blueprints, execution histories, node step logs, and DLQ records. |
| **`@prisma/client` & `prisma`** | `^6.19.3` | Type-safe ORM schema definitions, automated migrations, and relational cascading relations. |
| **`Next.js`** | `16.4.2` | Fullstack React serverless runtime providing App Router API routes, Server-Sent Events, and SSR client layouts. |
| **`Tailwind CSS`** | `^4.x` | Modern styling engine with tailored dark and soft off-white design tokens. |
| **`vitest`** | `^5.0.5` | Fast unit and integration test runner validating cycle detection, Lua fan-in logic, and API endpoints. |

---

## 📂 Project Directory Structure

```text
my-app/
├── app/
│   ├── api/v1/
│   │   ├── cluster/
│   │   │   ├── events/route.ts      # SSE stream for cluster-wide events
│   │   │   └── health/route.ts      # Worker heartbeats & queue statistics
│   │   ├── cron/schedulers/route.ts # BullMQ repeatable jobs CRUD
│   │   ├── dlq/                     # DLQ replay & purge endpoints
│   │   ├── hooks/[webhookId]/       # Webhook ingestion (< 25ms SLA)
│   │   ├── runs/[runId]/stream/     # Per-run SSE telemetry stream
│   │   └── workflows/               # Workflow CRUD & cascade delete
│   ├── globals.css                  # Theme CSS variables & font definitions
│   ├── layout.tsx                   # Root HTML layout with theme wrapper
│   └── page.tsx                     # Main application view manager
├── components/
│   ├── canvas/                      # React Flow custom nodes & execution drawer
│   ├── hero/                        # 3D spatial landing page & tilt cards
│   ├── layout/                      # Liquid glass navbar & navigation tabs
│   ├── telemetry/                   # BullMQ Cron panel & worker metric tables
│   └── views/
│       ├── ArchitectureView.tsx     # Interactive system architecture spec
│       ├── DLQView.tsx              # Dead-letter queue inspection & replay
│       ├── StudioView.tsx           # React Flow workflow studio & delete modal
│       └── TelemetryView.tsx        # Cluster telemetry & live SSE stream
├── lib/
│   ├── cron/scheduler.ts            # BullMQ repeatable job helper methods
│   ├── dag/cycle-detector.ts        # Kahn's algorithm & 3-Color DFS cycle guard
│   ├── queue/bullmq.ts              # BullMQ queue & worker initialization
│   └── redis/lua-scripts.ts         # Redis Lua atomic fan-in & idempotency locks
├── prisma/
│   └── schema.prisma                # PostgreSQL models with cascading onDelete
├── scripts/
│   ├── benchmark-load.ts            # 200 concurrent webhook benchmark test
│   ├── seed-workflows.ts            # Seeds 3 demo workflows
│   ├── test-autoscaler.ts           # Autoscaler verification script
│   └── test-bulk-requests.ts        # Bulk webhook trigger helper
├── src/workers/
│   ├── autoscaler.ts                # Celery-style PID backlog autoscaler
│   └── dag-worker.ts                # Standalone BullMQ DAG worker entrypoint
├── docker-compose.yml               # PostgreSQL 16 + Redis 7 Docker services
├── package.json                     # Scripts and dependencies
└── README.md                        # Documentation
```

---

## 🧪 Testing Suite

Run the complete Vitest test suite covering cycle detection, DAG topology, Redis Lua scripts, and API routes:

```bash
npm test
```

To run individual tests:
```bash
# Test cycle detection math (Kahn's + 3-Color DFS)
npx vitest run lib/dag/cycle-detector.test.ts

# Test workflow CRUD and delete endpoints
npx vitest run app/api/v1/workflows/route.test.ts
npx vitest run app/api/v1/workflows/[workflowId]/route.test.ts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
