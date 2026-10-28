import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as sendOtpPOST } from "./send-otp/route";
import { POST as verifyOtpPOST } from "./verify-otp/route";
import { GET as meGET } from "./me/route";
import { POST as logoutPOST } from "./logout/route";

const redisStore: Record<string, string> = {};

vi.mock("@/lib/redis/client", () => ({
  redis: {
    set: vi.fn(async (key: string, val: string) => {
      redisStore[key] = val;
      return "OK";
    }),
    get: vi.fn(async (key: string) => redisStore[key] || null),
    del: vi.fn(async (key: string) => {
      delete redisStore[key];
      return 1;
    }),
  },
  createRedisConnection: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      upsert: vi.fn().mockImplementation(async ({ create }: any) => ({
        id: "usr_123456",
        email: create.email,
        createdAt: new Date(),
      })),
    },
  },
}));

describe("Authentication API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(redisStore)) delete redisStore[k];
  });

  it("POST /api/v1/auth/send-otp rejects invalid email with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email: "invalid-email" }),
    });

    const res = await sendOtpPOST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("POST /api/v1/auth/send-otp sends verification code", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email: "alice@company.com" }),
    });

    const res = await sendOtpPOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.devOtp).toBeDefined();

    // Verify OTP was stored in Redis
    expect(redisStore["otp:alice@company.com"]).toBe(data.devOtp);
  });

  it("POST /api/v1/auth/verify-otp sets session cookie on valid code", async () => {
    redisStore["otp:alice@company.com"] = "654321";

    const req = new NextRequest("http://localhost:3000/api/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: "alice@company.com", otp: "654321" }),
    });

    const res = await verifyOtpPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.email).toBe("alice@company.com");

    // Cookie set in response headers
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("chronograph_session=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("POST /api/v1/auth/verify-otp rejects invalid code with 401", async () => {
    redisStore["otp:alice@company.com"] = "654321";

    const req = new NextRequest("http://localhost:3000/api/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: "alice@company.com", otp: "000000" }),
    });

    const res = await verifyOtpPOST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it("GET /api/v1/auth/me returns null when unauthenticated", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/me");
    const res = await meGET(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.user).toBeNull();
  });

  it("POST /api/v1/auth/logout clears session cookie", async () => {
    const res = await logoutPOST();
    const data = await res.json();

    expect(data.success).toBe(true);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("chronograph_session=;");
  });
});

