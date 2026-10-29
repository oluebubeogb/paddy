/**
 * Memory extraction from conversation checkpoints.
 * Uses structured model output validated against schema.
 * Prefer explicit user statements; treat inferences as lower confidence.
 */

import { aiProvider } from "@/lib/ai/provider";
import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "./types";

const EXTRACTION_SYSTEM = `You extract durable personal information from a conversation between a user and their AI companion Paddy.

Rules:
- Only extract facts the user explicitly stated or clearly confirmed.
- Do NOT turn temporary emotions into permanent personality traits.
- Do NOT invent dates or details.
- Prefer short, factual memory statements.
- Mark sensitive content (health, finances, trauma, private relationships) as sensitivity "sensitive" or "highly_sensitive".
- For future events, only include a date if the user clearly stated one.
- If timing is unclear, set requiresClarification to true and date to null.
- Propose follow-ups only when the user asked to be reminded or mentioned a meaningful upcoming event.
- Return valid JSON only, matching this shape:
{
  "memories": [{ "category": "personal_fact|preference|episodic|relationship|goal|ongoing_situation", "content": "...", "confidence": 0.0-1.0, "sensitivity": "normal|sensitive|highly_sensitive", "source": "explicit_user_statement|inferred|user_correction" }],
  "events": [{ "title": "...", "description": null, "date": null, "timezone": null, "status": "upcoming", "requiresClarification": false }],
  "followUpProposals": [{ "relatedEventTitle": null, "reason": "...", "suggestedAt": null, "messageIntent": "...", "confidence": 0.0-1.0, "requiresApproval": false, "type": "explicit|contextual|spontaneous" }]
}
If nothing worth storing, return empty arrays.`;

export async function extractFromMessages(
  messages: { role: string; content: string }[]
): Promise<ExtractionResult> {
  if (messages.length === 0) {
    return { memories: [], events: [], followUpProposals: [] };
  }

  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  try {
    const result = await aiProvider.chat({
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: `Extract memories, events, and follow-up proposals from this conversation:\n\n${transcript}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 1500,
    });

    const raw = result.content.trim();
    // Strip markdown code fences if present
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn("Memory extraction: invalid JSON from model");
      return { memories: [], events: [], followUpProposals: [] };
    }

    const validated = ExtractionResultSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("Memory extraction: schema validation failed", validated.error.flatten());
      return { memories: [], events: [], followUpProposals: [] };
    }

    // Drop highly sensitive by default for durable storage (caller can override)
    const safe = {
      ...validated.data,
      memories: validated.data.memories.filter(
        (m) => m.sensitivity !== "highly_sensitive"
      ),
    };

    return safe;
  } catch (err) {
    console.error("Memory extraction failed", err);
    return { memories: [], events: [], followUpProposals: [] };
  }
}
