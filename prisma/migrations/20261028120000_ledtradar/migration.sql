-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "hintsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "hintBasis" JSONB;

-- CreateTable
CREATE TABLE "HintRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "surveyId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "rung" SMALLINT,
    "hint" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "impersonated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HintRequest_studentId_questionId_idx" ON "HintRequest"("studentId", "questionId");

-- CreateIndex
CREATE INDEX "HintRequest_surveyId_idx" ON "HintRequest"("surveyId");

-- AddForeignKey
ALTER TABLE "HintRequest" ADD CONSTRAINT "HintRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintRequest" ADD CONSTRAINT "HintRequest_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintRequest" ADD CONSTRAINT "HintRequest_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

