-- CreateTable: lärarsläppta omgångar i tidslinjespelet.
--
-- Läraren skapar en omgång ur ett tidsspann (oftast ett moment), bockar ur
-- händelser och släpper den. Alla elever får samma uppgifter och ett försök
-- var. Omgången är dold tills releasedAt sätts och kan stängas med closedAt.
--
-- TimelineGameRound får releaseId: NULL för fritt spel (oförändrat för alla
-- befintliga rader), satt för en släppt omgång. Unikt på (releaseId, studentId)
-- ger ett försök per elev; NULL räknas som distinkt, så fritt spel påverkas inte.

-- AlterTable
ALTER TABLE "TimelineGameRound" ADD COLUMN     "releaseId" INTEGER;

-- CreateTable
CREATE TABLE "TimelineGameRelease" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "unitId" INTEGER,
    "title" TEXT NOT NULL,
    "fran" INTEGER NOT NULL,
    "till" INTEGER NOT NULL,
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seed" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineGameRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineGameRelease_courseId_idx" ON "TimelineGameRelease"("courseId");

-- CreateIndex
CREATE INDEX "TimelineGameRelease_unitId_idx" ON "TimelineGameRelease"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineGameRound_releaseId_studentId_key" ON "TimelineGameRound"("releaseId", "studentId");

-- AddForeignKey
ALTER TABLE "TimelineGameRound" ADD CONSTRAINT "TimelineGameRound_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "TimelineGameRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameRelease" ADD CONSTRAINT "TimelineGameRelease_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TimelineGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameRelease" ADD CONSTRAINT "TimelineGameRelease_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameRelease" ADD CONSTRAINT "TimelineGameRelease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

