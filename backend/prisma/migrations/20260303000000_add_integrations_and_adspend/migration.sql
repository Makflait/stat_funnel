-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('APPHUD', 'APPSFLYER');

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "spend" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpendDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_appId_idx" ON "Integration"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_appId_type_key" ON "Integration"("appId", "type");

-- CreateIndex
CREATE INDEX "AdSpendDaily_appId_date_idx" ON "AdSpendDaily"("appId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendDaily_appId_date_source_key" ON "AdSpendDaily"("appId", "date", "source");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpendDaily" ADD CONSTRAINT "AdSpendDaily_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
