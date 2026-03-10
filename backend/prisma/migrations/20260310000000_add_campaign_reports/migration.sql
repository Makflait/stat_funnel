-- AlterTable: add campaign column to AdSpendDaily
ALTER TABLE "AdSpendDaily" ADD COLUMN "campaign" TEXT NOT NULL DEFAULT '';

-- DropIndex old unique constraint
DROP INDEX "AdSpendDaily_appId_date_source_key";

-- CreateIndex new unique constraint with campaign
CREATE UNIQUE INDEX "AdSpendDaily_appId_date_source_campaign_key" ON "AdSpendDaily"("appId", "date", "source", "campaign");

-- CreateTable CampaignReport
CREATE TABLE "CampaignReport" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mediaSource" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT '',
    "installs" INTEGER NOT NULL DEFAULT 0,
    "trials" INTEGER NOT NULL DEFAULT 0,
    "subscriptions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex unique
CREATE UNIQUE INDEX "CampaignReport_appId_date_mediaSource_campaign_key" ON "CampaignReport"("appId", "date", "mediaSource", "campaign");

-- CreateIndex indexes
CREATE INDEX "CampaignReport_appId_date_idx" ON "CampaignReport"("appId", "date");
CREATE INDEX "CampaignReport_appId_mediaSource_idx" ON "CampaignReport"("appId", "mediaSource");
