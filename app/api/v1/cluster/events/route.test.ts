import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/lib/redis/client", () => ({
  createRedisConnection: vi.fn(() => mockSubscriber),
}));

describe("GET /api/v1/cluster/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
  });

  it("subscribes to channel:cluster:events and returns SSE headers", async () => {
    const abortController = new AbortController();
    const req = new NextRequest("http://localhost:3000/api/v1/cluster/events", {
      signal: abortController.signal,
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    expect(mockSubscribe).toHaveBeenCalledWith("channel:cluster:events");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();

    // 1. Initial handshake
    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);
    const firstText = decoder.decode(firstChunk.value);
    expect(firstText).toContain("event: connected");

    // 2. Redis message streamed
    const testEvt = { event: "WORKFLOW_TRIGGERED", runId: "test-run" };
    expect(messageHandler).toBeDefined();
    messageHandler!("channel:cluster:events", JSON.stringify(testEvt));

    const secondChunk = await reader!.read();
    expect(secondChunk.done).toBe(false);
    const secondText = decoder.decode(secondChunk.value);
    expect(secondText).toContain("event: WORKFLOW_TRIGGERED");
    expect(secondText).toContain(`"runId":"test-run"`);

    // 3. Cleanup on abort
    abortController.abort();
    expect(mockUnsubscribe).toHaveBeenCalledWith("channel:cluster:events");

    await reader!.cancel();
  });
});
