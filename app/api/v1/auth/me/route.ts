import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  return NextResponse.json({
    success: true,
    user: session ? { email: session.email } : null,
  });
}

