import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { challengeService } from "@/lib/auth/challenges";
import { limitChallengeRedeem } from "@/lib/auth/issue";

/**
 * Backs the email's "Copy my secret phrase" button. The token arrives from the
 * page's URL fragment (never sent in a GET/referrer). Does not consume.
 */
const schema = z.object({ token: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const limited = limitChallengeRedeem(req);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const found = await challengeService.peekPhraseByToken(parsed.data.token);
  if (!found) {
    return NextResponse.json(
      { error: "This little secret has expired or was already used. Let's send you a fresh one." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { phrase: found.phrase, purpose: found.purpose },
    { headers: { "Cache-Control": "no-store" } }
  );
}
