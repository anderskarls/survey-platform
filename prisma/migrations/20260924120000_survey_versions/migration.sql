-- AlterTable: en ny version av ett släppt veckotest - samma ord, nya meningar.
--
-- Önskemål från läraren i Engelska 5/7: kunna skicka ut veckotestet igen utan
-- att eleverna känner igen meningen i stället för ordet. Versionen är en egen
-- enkät med egna resultat bredvid originalet; kolumnerna finns för att veta
-- vilket test den är en version av och vilket nummer den har.
--
-- NULL i båda för alla befintliga enkäter - ingenting ändras för dem.
ALTER TABLE "Survey" ADD COLUMN "versionOfId" INTEGER;
ALTER TABLE "Survey" ADD COLUMN "versionNumber" INTEGER;

-- Tas originalet bort står versionerna kvar som vanliga test.
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_versionOfId_fkey"
  FOREIGN KEY ("versionOfId") REFERENCES "Survey"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Två samtidiga klick får inte ge två "version 2". NULL räknas som distinkt i
-- Postgres, så alla original (NULL, NULL) går igenom.
CREATE UNIQUE INDEX "Survey_versionOfId_versionNumber_key"
  ON "Survey"("versionOfId", "versionNumber");
