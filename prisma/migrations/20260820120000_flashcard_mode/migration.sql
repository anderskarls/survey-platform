-- AlterTable: flashcardläge per kurs (presentationsläge, inte frågetyp)
ALTER TABLE "Course" ADD COLUMN "flashcardMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: FSRS-betyg på quizsvar när eleven självskattat kortet
ALTER TABLE "Answer" ADD COLUMN "grade" INTEGER;
