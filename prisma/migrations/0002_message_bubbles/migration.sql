-- Multi-bubble chat: turn grouping + quoted replies
ALTER TABLE "messages" ADD COLUMN "turn_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN "reply_to_id" TEXT;

-- CreateIndex
CREATE INDEX "messages_turn_id_idx" ON "messages"("turn_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
