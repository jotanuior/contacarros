-- Add index for period-only readings queries
CREATE INDEX "Reading_capturedAt_idx" ON "Reading"("capturedAt");
