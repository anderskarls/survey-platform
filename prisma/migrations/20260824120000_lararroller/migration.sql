-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'TEACHER');

-- AlterTable: rollen på adminkontot. Kolumnen läggs till med TEACHER som
-- default (nya konton ska bli det snävaste), men varje konto som redan finns
-- när migrationen körs är ägaren själv och sätts om till OWNER nedan.
ALTER TABLE "Admin" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'TEACHER';

-- Befintliga konton är ägarkonton. Utan den här raden låser migrationen ut
-- den enda som kan dela ut behörigheter.
UPDATE "Admin" SET "role" = 'OWNER';

-- CreateTable: vilka kurser ett TEACHER-konto når
CREATE TABLE "AdminCourse" (
    "adminId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCourse_pkey" PRIMARY KEY ("adminId","courseId")
);

-- CreateIndex
CREATE INDEX "AdminCourse_courseId_idx" ON "AdminCourse"("courseId");

-- AddForeignKey
ALTER TABLE "AdminCourse" ADD CONSTRAINT "AdminCourse_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCourse" ADD CONSTRAINT "AdminCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
