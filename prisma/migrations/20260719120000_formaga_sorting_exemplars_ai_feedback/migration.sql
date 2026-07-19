-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "subskill" TEXT,
ADD COLUMN     "config" JSONB,
ADD COLUMN     "exemplars" JSONB;

-- AlterTable
ALTER TABLE "PracticeAttempt" ADD COLUMN     "aiFeedback" TEXT;
