import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyStoredOtp, signSessionToken, COOKIE_NAME } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and 6-digit OTP code are required." },
        { status: 400 }
      );
    }

    const isValid = await verifyStoredOtp(email, otp);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired verification code. Please request a new one." },
        { status: 401 }
      );
    }

    // Upsert user record in PostgreSQL
    let userId: string | undefined;
    try {
      const user = await (db as any).user.upsert({
        where: { email },
        update: {},
        create: { email },
      });
      userId = user.id;
    } catch (err) {
      console.warn("[VerifyOTP] DB User table upsert error:", err);
    }

    const token = signSessionToken(email);
    const res = NextResponse.json({
      success: true,
      message: "Authentication successful.",
      user: {
        email,
        id: userId,
      },
    });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[VerifyOTP] Error:", err);
    return NextResponse.json(
      { success: false, error: errMsg || "Authentication failed." },
      { status: 500 }
    );
  }
}

