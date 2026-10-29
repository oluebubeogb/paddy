import { NextResponse } from "next/server";

/**
 * Expose the VAPID public key so the client can subscribe to Web Push.
 * Safe to share — only the public key is returned.
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Web Push is not configured", configured: false },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey: key, configured: true });
}
