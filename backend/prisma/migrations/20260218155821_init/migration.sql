-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appStoreUrl" TEXT,
    "iconUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "installTotal" INTEGER NOT NULL,
    "paywallShownTotal" INTEGER NOT NULL,
    "trialStartedTotal" INTEGER NOT NULL,
    "subscriptionStartedTotal" INTEGER NOT NULL,
    "subscriptionCancelledTotal" INTEGER NOT NULL,
    "paymentFailedTotal" INTEGER NOT NULL,
    "subscriptionActiveTotal" INTEGER NOT NULL,
    "installDay" INTEGER NOT NULL,
    "paywallShownDay" INTEGER NOT NULL,
    "trialStartedDay" INTEGER NOT NULL,
    "subscriptionStartedDay" INTEGER NOT NULL,
    "subscriptionCancelledDay" INTEGER NOT NULL,
    "paymentFailedDay" INTEGER NOT NULL,
    "subscriptionActiveDay" INTEGER NOT NULL,
    "netGrowthDay" INTEGER NOT NULL,
    "adSpend" DECIMAL(10,2) NOT NULL,
    "revenueDay" DECIMAL(10,2) NOT NULL,
    "refundsDay" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "App_ownerId_idx" ON "App"("ownerId");

-- CreateIndex
CREATE INDEX "Report_appId_date_idx" ON "Report"("appId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Report_appId_date_key" ON "Report"("appId", "date");

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
