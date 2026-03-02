-- CreateTable
CREATE TABLE "GeoReport" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL,
    "trialStartedDay" INTEGER NOT NULL DEFAULT 0,
    "subscriptionStartedDay" INTEGER NOT NULL DEFAULT 0,
    "subscriptionCancelledDay" INTEGER NOT NULL DEFAULT 0,
    "activeSubscriptionsDay" INTEGER NOT NULL DEFAULT 0,
    "netGrowthDay" INTEGER NOT NULL DEFAULT 0,
    "revenueDay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundsDay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoReport_appId_date_idx" ON "GeoReport"("appId", "date");

-- CreateIndex
CREATE INDEX "GeoReport_appId_country_idx" ON "GeoReport"("appId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "GeoReport_appId_date_country_key" ON "GeoReport"("appId", "date", "country");

-- AddForeignKey
ALTER TABLE "GeoReport" ADD CONSTRAINT "GeoReport_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
