-- Add purchase tracking fields to GeoReport
ALTER TABLE "GeoReport" ADD COLUMN "purchasesDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GeoReport" ADD COLUMN "purchasesRevenueDay" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Create TelegramEventLog for deduplication
CREATE TABLE "TelegramEventLog" (
    "id"           TEXT NOT NULL,
    "appId"        TEXT NOT NULL,
    "messageId"    TEXT NOT NULL,
    "eventType"    TEXT NOT NULL,
    "apphudUserId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramEventLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramEventLog_appId_messageId_key"
    ON "TelegramEventLog"("appId", "messageId");

CREATE INDEX "TelegramEventLog_appId_createdAt_idx"
    ON "TelegramEventLog"("appId", "createdAt");
