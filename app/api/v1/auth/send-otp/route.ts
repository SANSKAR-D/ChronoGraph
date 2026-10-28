import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { storeOtp } from "@/lib/auth/session";
import { sendOtpEmail } from "@/lib/auth/email";
import { redis } from "@/lib/redis/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Generate cryptographically random 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store in Redis (5-minute TTL)
    await storeOtp(email, otp);

    // Send via SMTP
    const mailResult = await sendOtpEmail(email, otp);

    if (!mailResult.success) {
      // Invalidate stored OTP on delivery failure
      try {
        await redis.del(`otp:${email}`);
      } catch {}

      return NextResponse.json(
        { success: false, error: mailResult.error || "Failed to send verification code." },
        { status: 500 }
      );
    }

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      success: true,
      message: isDev && mailResult.devMode
        ? "Verification code generated (simulated in development mode)."
        : `Verification code sent to ${email}.`,
      devMode: isDev ? mailResult.devMode : undefined,
      // In development mode only, surface the OTP to allow seamless local verification
      devOtp: isDev && mailResult.devMode ? otp : undefined,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[SendOTP] Error:", err);
    return NextResponse.json(
      { success: false, error: errMsg || "Failed to send verification code." },
      { status: 500 }
    );
  }
}

