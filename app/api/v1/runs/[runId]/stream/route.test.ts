import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

let messageHandler: ((chan: string, msg: string) => void) | null = null;
const mockSubscribe = vi.fn().mockResolvedValue(1);
const mockUnsubscribe = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue("OK");
const mockDisconnect = vi.fn();

const mockSubscriber = {
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  quit: mockQuit,
  disconnect: mockDisconnect,
  on: vi.fn((event: string, cb: any) => {
    if (event === "message") {
      messageHandler = cb;
    }
  }),
};

vi.mock("@/lib/db", () => ({
  db: {
    workflowRun: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis/client", () => ({
  createRedisConnection: vi.fn(() => mockSubscriber),
}));

import { db } from "@/lib/db";

describe("GET /api/v1/runs/[runId]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
  });

  it("returns 400 if runId is not a valid UUID", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/runs/invalid-uuid/stream");
    const res = await GET(req, {
      params: Promise.resolve({ runId: "invalid-uuid" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("UUID format");
  });

  it("returns 404 if workflow run is not found in database", async () => {
    vi.mocked(db.workflowRun.findUnique).mockResolvedValue(null);

    const validUuid = "11111111-2222-3333-4444-555555555555";
    const req = new NextRequest(`http://localhost:3000/api/v1/runs/${validUuid}/stream`);
    const res = await GET(req, {
      params: Promise.resolve({ runId: validUuid }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("was not found");
  });

  it("subscribes to Redis channel and streams events with text/event-stream headers", async () => {
    const validUuid = "22222222-3333-4444-5555-666666666666";
    vi.mocked(db.workflowRun.findUnique).mockResolvedValue({
      id: validUuid,
      status: "RUNNING" as any,
    } as any);

    const abortController = new AbortController();
    const req = new NextRequest(`http://localhost:3000/api/v1/runs/${validUuid}/stream`, {
      signal: abortController.signal,
    });

    const res = await GET(req, {
      params: Promise.resolve({ runId: validUuid }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    expect(mockSubscribe).toHaveBeenCalledWith(`channel:run:${validUuid}`);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();

    // 1. First event should be the connected handshake
    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);
    const firstText = decoder.decode(firstChunk.value);
    expect(firstText).toContain("event: connected");
    expect(firstText).toContain(`"runId":"${validUuid}"`);

    // 2. Simulate worker publishing an event to Redis
    const telemetryEvent = {
      event: "NODE_STATE_CHANGE",
      runId: validUuid,
      nodeId: "node_http_1",
      status: "RUNNING",
      attempt: 1,
    };
    expect(messageHandler).toBeDefined();
    messageHandler!(`channel:run:${validUuid}`, JSON.stringify(telemetryEvent));

    const secondChunk = await reader!.read();
    expect(secondChunk.done).toBe(false);
    const secondText = decoder.decode(secondChunk.value);
    expect(secondText).toContain("event: NODE_STATE_CHANGE");
    expect(secondText).toContain(`"status":"RUNNING"`);

    // 3. Trigger client abort and verify subscriber cleanup
    abortController.abort();
    expect(mockUnsubscribe).toHaveBeenCalledWith(`channel:run:${validUuid}`);
    expect(mockQuit).toHaveBeenCalled();

    await reader!.cancel();
  });

  it("closes stream cleanly if workflow run is already completed", async () => {
    const validUuid = "33333333-4444-5555-6666-777777777777";
    vi.mocked(db.workflowRun.findUnique).mockResolvedValue({
      id: validUuid,
      status: "COMPLETED" as any,
    } as any);

    const req = new NextRequest(`http://localhost:3000/api/v1/runs/${validUuid}/stream`);
    const res = await GET(req, {
      params: Promise.resolve({ runId: validUuid }),
    });

    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);
    const decoder = new TextDecoder();
    expect(decoder.decode(firstChunk.value)).toContain("COMPLETED");

    // Wait briefly for auto-close of completed run
    await new Promise((r) => setTimeout(r, 150));
    const nextChunk = await reader!.read();
    expect(nextChunk.done).toBe(true);
  });
});
