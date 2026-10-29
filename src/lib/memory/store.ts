/**
 * Memory persistence and retrieval.
 * Embeddings are optional in Phase 2 bootstrap — text ranking works without them.
 */

import { prisma } from "@/lib/db";
import { normalizeAiBaseUrl } from "@/lib/ai/provider";
import type { ExtractedMemory } from "./types";

export interface StoredMemory {
  id: string;
  category: string;
  content: string;
  confidence: number;
  importance: number;
  sensitivity: string;
  createdAt: Date;
  lastConfirmedAt: Date | null;
}

/**
 * Persist extracted memories with simple duplicate detection.
 */
export async function persistMemories(
  userId: string,
  conversationId: string,
  messageId: string | null,
  extracted: ExtractedMemory[]
): Promise<StoredMemory[]> {
  const stored: StoredMemory[] = [];

  for (const item of extracted) {
    // Skip very low confidence
    if (item.confidence < 0.5) continue;

    // Simple duplicate / update check: same category + similar content
    const existing = await prisma.memory.findFirst({
      where: {
        userId,
        category: item.category,
        deletedAt: null,
        content: { contains: item.content.slice(0, 40), mode: "insensitive" },
      },
    });

    if (existing) {
      // Update confidence / confirmation if new info reinforces
      const updated = await prisma.memory.update({
        where: { id: existing.id },
        data: {
          content: item.content,
          confidence: Math.max(existing.confidence, item.confidence),
          lastConfirmedAt: new Date(),
          sourceConversationId: conversationId,
          sourceMessageId: messageId,
        },
      });
      stored.push(mapMemory(updated));
      continue;
    }

    const created = await prisma.memory.create({
      data: {
        userId,
        category: item.category,
        content: item.content,
        confidence: item.confidence,
        importance: item.category === "goal" || item.category === "ongoing_situation" ? 0.7 : 0.5,
        sensitivity: item.sensitivity,
        sourceConversationId: conversationId,
        sourceMessageId: messageId,
        lastConfirmedAt: new Date(),
      },
    });
    stored.push(mapMemory(created));
  }

  return stored;
}

function mapMemory(m: {
  id: string;
  category: string;
  content: string;
  confidence: number;
  importance: number;
  sensitivity: string;
  createdAt: Date;
  lastConfirmedAt: Date | null;
}): StoredMemory {
  return {
    id: m.id,
    category: m.category,
    content: m.content,
    confidence: m.confidence,
    importance: m.importance,
    sensitivity: m.sensitivity,
    createdAt: m.createdAt,
    lastConfirmedAt: m.lastConfirmedAt,
  };
}

/**
 * Retrieve relevant memories for a user message.
 * Uses keyword overlap + recency + importance when embeddings are unavailable.
 */
export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  limit = 8
): Promise<StoredMemory[]> {
  const memories = await prisma.memory.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ importance: "desc" }, { lastConfirmedAt: "desc" }, { createdAt: "desc" }],
    take: 80,
  });

  if (memories.length === 0) return [];

  const terms = tokenize(query);
  const scored = memories.map((m) => {
    const memTerms = tokenize(m.content);
    const overlap = terms.filter((t) => memTerms.includes(t)).length;
    const recencyBoost = m.lastConfirmedAt
      ? Math.max(0, 1 - (Date.now() - m.lastConfirmedAt.getTime()) / (90 * 24 * 60 * 60 * 1000))
      : 0.3;
    const score =
      overlap * 2 +
      m.confidence * 1.5 +
      m.importance +
      recencyBoost;
    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Always include high-importance profile-like facts even with low overlap
  const top = scored.slice(0, limit).map((s) => mapMemory(s.memory));
  return top;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Soft-delete a memory and exclude it from future retrieval.
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<boolean> {
  const result = await prisma.memory.updateMany({
    where: { id: memoryId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Clear memories by category or all for a user.
 */
export async function clearMemories(
  userId: string,
  category?: string
): Promise<number> {
  const result = await prisma.memory.updateMany({
    where: {
      userId,
      deletedAt: null,
      ...(category ? { category } : {}),
    },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

/**
 * Optional embedding generation (requires embedding-capable provider).
 * Stored via raw SQL when pgvector is available; no-op if not configured.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = normalizeAiBaseUrl(process.env.AI_BASE_URL);
  const model = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";
  // Set AI_EMBEDDING_MODEL=none for chat-only endpoints (e.g. RunPod vLLM) so
  // we don't spend a billed request on an /embeddings call that will fail.
  if (!apiKey || model.toLowerCase() === "none") return null;

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[ai] embeddings unavailable", { status: res.status, model, baseUrl });
      return null;
    }
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}
