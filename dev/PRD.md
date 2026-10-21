# ChronoGraph — Product Requirements Document (PRD)
**Product Name:** ChronoGraph[cite: 18]  
**Track:** CodeSangam 2026 Webster — PS-04 (The Dormammu Loop)[cite: 1, 2, 8, 18]

---

## 1. Product Vision & Problem Statement
Developers building event-driven pipelines face a painful gap between brittle cron scripts and bloated enterprise orchestrators[cite: 8, 18]. **ChronoGraph** is a visual, distributed Directed Acyclic Graph (DAG) workflow automation engine that lets engineers compose, validate, trigger, and observe asynchronous pipelines in real time with mathematical guarantees against infinite loops, race conditions, and silent task failures[cite: 8, 18].

---

## 2. Target User Personas
1. **Backend & Platform Engineers:** Need reliable webhook ingestion, topological dependency resolution, idempotent retries, and Dead-Letter Queue (DLQ) recovery without writing boilerplate queue code[cite: 8, 18].
2. **Hackathon Judges & Evaluators:** Need an immediately testable, zero-friction live demo with visible proof of cycle detection, concurrent worker execution, SSE log streaming, and load-test telemetry[cite: 2, 8, 16].

---

## 3. Functional Requirements

### 3.1 Foundational Scope (Pass Tier — P0 Mandatory)
* **FR-01: Visual DAG Flow Builder (`@xyflow/react`)[cite: 8, 18]:**
  * Support 5 core node types:
    1. `WEBHOOK_TRIGGER` (Root trigger generating a unique HMAC-protected endpoint)[cite: 8, 18].
    2. `CRON_TRIGGER` (Root trigger accepting standard 5-field cron expressions)[cite: 8, 18].
    3. `HTTP_REQUEST` (Configurable URL, Method, Headers, JSON body with template variable interpolation `{{parentNode.output.field}}`)[cite: 8].
    4. `JSON_TRANSFORM` (Extracts, filters, or remaps upstream JSON payloads)[cite: 8, 18].
    5. `DELAY_TIMER` (Non-blocking wait duration in milliseconds/seconds via BullMQ delayed jobs)[cite: 8, 18].
* **FR-02: Real-Time Cycle Detection Validation[cite: 8, 18]:**
  * Block any edge connection on the canvas that creates a direct or transitive cycle ($u \leadsto v \leadsto u$)[cite: 8, 18].
  * Display an immediate visual alert explaining which nodes form the forbidden loop[cite: 18].
* **FR-03: Deterministic Topological Execution Engine[cite: 8, 18]:**
  * Execute nodes strictly in topological order based on upstream parent success[cite: 8, 18].
  * Support fan-out (1 parent $\rightarrow$ $N$ children in parallel) and fan-in/diamond convergence ($N$ parents $\rightarrow$ 1 child waiting for all $N$ to succeed)[cite: 8, 18].
* **FR-04: Execution History & Step Telemetry[cite: 8, 18]:**
  * Persist every workflow run and per-node execution attempt in PostgreSQL[cite: 18].
  * Display input/output JSON payloads, start/end timestamps, millisecond duration, and HTTP status codes per node[cite: 8, 18].
* **FR-05: Webhook & Cron Trigger Engine[cite: 8, 18]:**
  * Provide a one-click `cURL` copy button and built-in "Send Test Webhook Payload" trigger in the studio UI[cite: 8].
  * Register repeatable cron schedules inside BullMQ upon workflow activation[cite: 8].

### 3.2 Ascended Mastery Scope (Victory Tier — P1 Competitive Edge)
* **FR-06: Distributed Worker Queue & Heartbeats[cite: 8, 18]:**
  * Run decoupled worker processes connected to Redis via BullMQ[cite: 8, 18].
  * Display live worker cluster health (Active Workers, Heartbeat Latency, Queue Depth) in the UI header[cite: 8, 18].
* **FR-07: Idempotency, Exponential Backoff with Jitter & DLQ[cite: 8, 18]:**
  * Allow per-node configuration of `maxRetries` (0–10) and `baseBackoffMs`[cite: 8, 18].
  * Route permanently failed jobs to a dedicated **Dead-Letter Queue (DLQ) Inspector** tab with a **"Replay from Failed Node"** button[cite: 8, 18].
* **FR-08: Live Execution Streaming via Server-Sent Events (SSE)[cite: 8, 18]:**
  * Stream real-time node state transitions (`QUEUED` $\rightarrow$ `RUNNING` $\rightarrow$ `RETRYING` $\rightarrow$ `SUCCESS` / `DLQ`) directly to the canvas without page reloads[cite: 8, 18].
* **FR-09: Built-in Chaos & Concurrency Stress Tester (Viva Demo Feature)[cite: 8]:**
  * Include a **"Chaos Mode / Stress Test"** button in the studio dock that fires 50 concurrent webhooks or injects a simulated `HTTP 503` failure on a target node so judges can visually verify exponential backoff jitter and atomic diamond convergence live[cite: 8, 18].

---

## 4. Non-Functional Requirements & Performance Benchmarks
* **NFR-01 (Webhook Trigger Latency):** API Gateway must return `202 Accepted` with `runId` in **$< 25\text{ ms}$ ($p99$)** under a 100-request burst[cite: 8, 18].
* **NFR-02 (Zero Race Conditions):** 100% accuracy on diamond dependency convergence ($A \rightarrow \{B, C, D\} \rightarrow E$) across 500 concurrent runs[cite: 8, 18].
* **NFR-03 (Canvas Frame Rate):** Smooth 60fps panning, zooming, and 3D stage tilting on graphs up to 50 nodes[cite: 8, 18].