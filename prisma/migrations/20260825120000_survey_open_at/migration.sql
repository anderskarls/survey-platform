-- AlterTable: läraren schemalägger när en enkät släpps till eleverna.
--
-- Utan fältet ligger kursens alla enkäter ute samtidigt. En kurs med ett
-- veckotest per vecka blev därmed en vägg av 27 test på elevens startsida,
-- där hela ordbanken gick att se i förväg - mätningen tappade sitt värde.
--
-- openAt = tidpunkten då enkäten blir synlig och besvarbar. NULL betyder
-- öppen direkt, så alla befintliga enkäter och alla andra kurser fortsätter
-- exakt som förut. En gång släppt förblir enkäten öppen; det finns med flit
-- inget closeAt, så den som varit sjuk kan ta igen.
ALTER TABLE "Survey" ADD COLUMN "openAt" TIMESTAMP(3);

-- Elevvyerna filtrerar kursens enkäter på släpptidpunkt vid varje sidladdning.
CREATE INDEX "Survey_courseId_openAt_idx" ON "Survey"("courseId", "openAt");
