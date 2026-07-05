-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "personKey" TEXT;

-- CreateIndex
CREATE INDEX "Student_personKey_idx" ON "Student"("personKey");
