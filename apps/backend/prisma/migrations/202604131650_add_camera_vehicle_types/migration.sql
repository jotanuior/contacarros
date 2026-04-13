CREATE TABLE "CameraVehicleType" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'INTELBRAS',
    "rawType" TEXT NOT NULL,
    "normalizedRawType" TEXT NOT NULL,
    "mappedCategory" "VehicleCategoryType",
    "mappedSubtype" TEXT,
    "sampleBrand" TEXT,
    "sampleDirection" TEXT,
    "samplePlateColor" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraVehicleType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CameraVehicleType_source_normalizedRawType_key" ON "CameraVehicleType"("source", "normalizedRawType");
CREATE INDEX "CameraVehicleType_rawType_idx" ON "CameraVehicleType"("rawType");