/** Shape of a chat message sent to the client (shared by chat routes). */
export const messageSelect = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  origin: true,
  generationStatus: true,
  turnId: true,
  sequence: true,
  replyToId: true,
  createdAt: true,
  replyTo: { select: { id: true, role: true, content: true } },
} as const;
