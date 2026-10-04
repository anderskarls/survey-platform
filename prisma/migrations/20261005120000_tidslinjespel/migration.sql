-- CreateTable: tidslinjespelet - ett fristående spel mot kursens tidslinjekorpus.
--
-- Eleven spelar omgångar (placera på linjen, skriv årtalet, vilken kom först)
-- från en egen sida i appen i stället för att möta tidslinjefrågor i ett quiz.
-- TimelineGame är korpusen (en per tidslinjekurs, uppladdad ur tidslinjerepot),
-- TimelineGameCourse kopplar den till en eller flera kurser, och
-- TimelineGameRound är en spelomgång med egen kopia av facit per uppgift.
--
-- Tre nya tabeller; inga befintliga rader rörs.

-- CreateTable
CREATE TABLE "TimelineGame" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineGameCourse" (
    "gameId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,

    CONSTRAINT "TimelineGameCourse_pkey" PRIMARY KEY ("gameId","courseId")
);

-- CreateTable
CREATE TABLE "TimelineGameRound" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TimelineGameRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimelineGame_slug_key" ON "TimelineGame"("slug");

-- CreateIndex
CREATE INDEX "TimelineGameCourse_courseId_idx" ON "TimelineGameCourse"("courseId");

-- CreateIndex
CREATE INDEX "TimelineGameRound_gameId_studentId_idx" ON "TimelineGameRound"("gameId", "studentId");

-- CreateIndex
CREATE INDEX "TimelineGameRound_studentId_createdAt_idx" ON "TimelineGameRound"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "TimelineGameCourse" ADD CONSTRAINT "TimelineGameCourse_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TimelineGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameCourse" ADD CONSTRAINT "TimelineGameCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameRound" ADD CONSTRAINT "TimelineGameRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TimelineGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineGameRound" ADD CONSTRAINT "TimelineGameRound_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

