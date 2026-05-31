-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "period" TEXT;
