import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
  });

  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return res;
}

