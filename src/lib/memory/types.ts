import { z } from "zod";

export const MEMORY_CATEGORIES = [
  "personal_fact",
  "preference",
  "episodic",
  "relationship",
  "goal",
  "ongoing_situation",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const ExtractedMemorySchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  sensitivity: z.enum(["normal", "sensitive", "highly_sensitive"]).default("normal"),
  source: z.enum(["explicit_user_statement", "inferred", "user_correction"]).default("explicit_user_statement"),
});

export const ExtractedEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  date: z.string().nullable().optional(), // ISO date if known
  timezone: z.string().nullable().optional(),
  status: z.enum(["upcoming", "ongoing", "completed", "cancelled"]).default("upcoming"),
  requiresClarification: z.boolean().default(false),
});

export const FollowUpProposalSchema = z.object({
  relatedEventTitle: z.string().optional().nullable(),
  reason: z.string(),
  suggestedAt: z.string().nullable().optional(), // ISO datetime
  messageIntent: z.string(),
  confidence: z.number().min(0).max(1),
  requiresApproval: z.boolean().default(false),
  type: z.enum(["explicit", "contextual", "spontaneous"]).default("contextual"),
});

export const ExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema).default([]),
  events: z.array(ExtractedEventSchema).default([]),
  followUpProposals: z.array(FollowUpProposalSchema).default([]),
});

export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;
export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;
export type FollowUpProposal = z.infer<typeof FollowUpProposalSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
