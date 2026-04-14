-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "isGratuidade" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vehicle" ADD COLUMN "gratuidadeType" TEXT;

-- Index for filtering
CREATE INDEX "Vehicle_isGratuidade_idx" ON "Vehicle"("isGratuidade");
