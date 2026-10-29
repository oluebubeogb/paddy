import { NextResponse } from "next/server";
import {
  getSessionToken,
  destroySession,
  clearSessionCookie,
} from "@/lib/auth/session";

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
