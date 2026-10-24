import { describe, it, expect, vi } from "vitest";
import { executeHttpNode, HttpNodeError } from "./http-executor";

describe("T3.2: executeHttpNode Executor", () => {
  const sampleContext = {
    node_1: {
      data: {
        userId: "usr_4242",
        accountTier: "enterprise",
      },
      output: {
        token: "tok_secret_xyz",
      },
    },
    TRIGGER: {
      payload: {
        invoiceId: "inv_9000",
      },
    },
  };

  it("performs outbound fetch with template interpolation in URL, headers, and body", async () => {
    let capturedUrl = "";
    let capturedOptions: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedUrl = url;
      capturedOptions = opts;
      return new Response(JSON.stringify({ success: true, processedUserId: "usr_4242" }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await executeHttpNode({
      url: "https://api.stripe.com/v1/customers/{{node_1.data.userId}}/invoices",
      method: "POST",
      headers: {
        Authorization: "Bearer {{node_1.output.token}}",
        "X-Custom-Env": "production",
      },
      body: {
        invoiceId: "{{TRIGGER.payload.invoiceId}}",
        tier: "{{node_1.data.accountTier}}",
      },
      idempotencyKey: "idem_abc_123",
      context: sampleContext,
      fetchFn: mockFetch as any,
    });

    expect(capturedUrl).toBe("https://api.stripe.com/v1/customers/usr_4242/invoices");
    expect(capturedOptions.method).toBe("POST");
    expect(capturedOptions.headers["Authorization"]).toBe("Bearer tok_secret_xyz");
    expect(capturedOptions.headers["X-Custom-Env"]).toBe("production");
    // Verify X-Idempotency-Key injection
    expect(capturedOptions.headers["X-Idempotency-Key"]).toBe("idem_abc_123");
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");

    const parsedBody = JSON.parse(capturedOptions.body);
    expect(parsedBody.invoiceId).toBe("inv_9000");
    expect(parsedBody.tier).toBe("enterprise");

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ success: true, processedUserId: "usr_4242" });
    expect(result.idempotencyKey).toBe("idem_abc_123");
  });

  it("does not overwrite explicit X-Idempotency-Key if caller already set one", async () => {
    let capturedOptions: any = null;

    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedOptions = opts;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await executeHttpNode({
      url: "https://api.example.com/test",
      headers: {
        "x-idempotency-key": "explicit_key_456",
      },
      idempotencyKey: "injected_key_789",
      fetchFn: mockFetch as any,
    });

    expect(capturedOptions.headers["x-idempotency-key"]).toBe("explicit_key_456");
  });

  it("throws HttpNodeError on 4xx/5xx HTTP responses so BullMQ triggers retry or DLQ", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ error: "Service Unavailable", code: 503 }), {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      executeHttpNode({
        url: "https://api.example.com/charge",
        fetchFn: mockFetch as any,
      })
    ).rejects.toThrowError(HttpNodeError);
  });

  it("handles request timeout with AbortController", async () => {
    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    await expect(
      executeHttpNode({
        url: "https://slow-api.example.com/delay",
        timeoutMs: 50,
        fetchFn: mockFetch as any,
      })
    ).rejects.toThrowError(/timed out after 50ms/);
  });

  it("automatically prepends https:// to bare domain URLs", async () => {
    let capturedUrl = "";
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await executeHttpNode({
      url: "api.stripe.com/v1/balance",
      fetchFn: mockFetch as any,
    });

    expect(capturedUrl).toBe("https://api.stripe.com/v1/balance");
  });
});

