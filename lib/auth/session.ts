import { NextRequest } from "next/server";
import crypto from "crypto";
import { redis } from "../redis/client";

const COOKIE_NAME = "chronograph_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SECRET = process.env.WEBHOOK_SECRET || "chronograph_auth_session_secret_2026";

export interface AuthSessionUser {
  email: string;
}

/**
 * Stores a 6-digit OTP in Redis with a 5-minute (300 seconds) expiration.
 */
export async function storeOtp(email: string, otp: string): Promise<void> {
  const key = `otp:${email.trim().toLowerCase()}`;
  await redis.set(key, otp, "EX", 300);
}

/**
 * Verifies an OTP against Redis and deletes it on match.
 */
export async function verifyStoredOtp(email: string, otp: string): Promise<boolean> {
  const key = `otp:${email.trim().toLowerCase()}`;
  const stored = await redis.get(key);
  if (!stored) return false;
  if (stored.trim() !== otp.trim()) return false;
  // One-time use: consume and delete immediately
  await redis.del(key);
  return true;
}

/**
 * Signs a session payload into a secure HMAC token.
 */
export function signSessionToken(email: string): string {
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  const b64Payload = Buffer.from(payload).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET).update(b64Payload).digest("hex");
  return `${b64Payload}.${hmac}`;
}

/**
 * Validates a signed session token.
 */
export function verifySessionToken(token: string): AuthSessionUser | null {
  try {
    const [b64Payload, signature] = token.split(".");
    if (!b64Payload || !signature) return null;

    const expectedSig = crypto.createHmac("sha256", SECRET).update(b64Payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const json = JSON.parse(Buffer.from(b64Payload, "base64url").toString("utf8"));
    if (!json.email || typeof json.exp !== "number") return null;
    if (Date.now() > json.exp) return null;

    return { email: json.email };
  } catch {
    return null;
  }
}

/**
 * Reads and verifies the session from NextRequest cookies or Authorization header.
 */
export function getSessionUser(req?: NextRequest | Request): AuthSessionUser | null {
  if (!req) return null;

  let token: string | undefined;

  // 1. Try NextRequest cookies
  if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") {
    token = (req as NextRequest).cookies.get(COOKIE_NAME)?.value;
  }

  // 2. Try raw Cookie header
  if (!token) {
    const rawCookie = req.headers.get("cookie");
    if (rawCookie) {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
  }

  // 3. Try Authorization: Bearer <token>
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

export { COOKIE_NAME };

