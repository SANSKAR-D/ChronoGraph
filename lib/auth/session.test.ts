import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  storeOtp,
  verifyStoredOtp,
  getSessionUser,
  COOKIE_NAME,
} from "./session";
import { sendOtpEmail } from "./email";
import { NextRequest } from "next/server";

// Mock redis
vi.mock("@/lib/redis/client", () => {
  const store: Record<string, string> = {};
  return {
    redis: {
      set: vi.fn(async (key: string, val: string) => {
        store[key] = val;
        return "OK";
      }),
      get: vi.fn(async (key: string) => store[key] || null),
      del: vi.fn(async (key: string) => {
        delete store[key];
        return 1;
      }),
    },
    createRedisConnection: vi.fn(),
  };
});

describe("Auth Session & OTP Infrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores and verifies OTP with one-time consumption guarantee", async () => {
    const email = "developer@chronograph.dev";
    const otp = "849201";

    await storeOtp(email, otp);

    // First attempt with incorrect OTP fails
    const invalid = await verifyStoredOtp(email, "000000");
    expect(invalid).toBe(false);

    // Correct OTP succeeds
    const valid = await verifyStoredOtp(email, otp);
    expect(valid).toBe(true);

    // Replay attack / re-verify fails because token was consumed
    const replayed = await verifyStoredOtp(email, otp);
    expect(replayed).toBe(false);
  });

  it("signs and verifies HMAC session tokens", () => {
    const email = "lead@engineer.com";
    const token = signSessionToken(email);

    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const user = verifySessionToken(token);
    expect(user).toBeDefined();
    expect(user?.email).toBe(email);

    // Tampered token fails
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("reads authenticated session user from cookie header", () => {
    const email = "operator@cluster.io";
    const token = signSessionToken(email);

    const req = new NextRequest("http://localhost:3000/api/v1/auth/me", {
      headers: {
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });

    const user = getSessionUser(req);
    expect(user?.email).toBe(email);
  });

  it("sendOtpEmail runs in dev mode when SMTP environment is unconfigured", async () => {
    const res = await sendOtpEmail("test@example.com", "123456");
    expect(res.success).toBe(true);
    expect(res.devMode).toBe(true);
  });
});

