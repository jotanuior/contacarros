-- Add an idempotency key for external camera events.
ALTER TABLE "Reading"
ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "Reading_eventKey_key"
ON "Reading"("eventKey");