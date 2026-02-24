-- AlterTable: add geo column with default 'ALL'
ALTER TABLE "Report" ADD COLUMN "geo" TEXT NOT NULL DEFAULT 'ALL';

-- DropIndex: old unique and index
DROP INDEX "Report_appId_date_key";
DROP INDEX "Report_appId_date_idx";

-- CreateIndex: new unique (appId, date, geo)
CREATE UNIQUE INDEX "Report_appId_date_geo_key" ON "Report"("appId", "date", "geo");

-- CreateIndex: new index (appId, geo, date DESC)
CREATE INDEX "Report_appId_geo_date_idx" ON "Report"("appId", "geo", "date" DESC);
