-- Date of birth captured on first login (sleek Paddy date picker).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dob_prompted_at" TIMESTAMP(3);

-- Endless chat timeline: newest messages across a user's sessions, paginated.
CREATE INDEX IF NOT EXISTS "messages_user_id_created_at_idx" ON "messages"("user_id", "created_at");
