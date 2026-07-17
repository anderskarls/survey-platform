-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "unitId" INTEGER;

-- CreateTable
CREATE TABLE "CampaignSnapshot" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSnapshot_courseId_key" ON "CampaignSnapshot"("courseId");

-- CreateIndex
CREATE INDEX "Topic_unitId_idx" ON "Topic"("unitId");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSnapshot" ADD CONSTRAINT "CampaignSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
