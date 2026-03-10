-- Add country column to CampaignReport
ALTER TABLE "CampaignReport" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';

-- Drop old unique index
DROP INDEX IF EXISTS "CampaignReport_appId_date_mediaSource_campaign_key";

-- Create new unique index including country
CREATE UNIQUE INDEX "CampaignReport_appId_date_mediaSource_campaign_country_key"
  ON "CampaignReport" ("appId", "date", "mediaSource", "campaign", "country");

-- Add country index
CREATE INDEX "CampaignReport_appId_country_idx" ON "CampaignReport" ("appId", "country");
