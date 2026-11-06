-- AlterTable: momentuppgifter kan höra till en serie (kartvyn).
--
-- En karta som fylls i lektion för lektion var tidigare en uppgift per lektion
-- som lämnades in var för sig. Med series samlas de i en vy med en flik per
-- lektion, där allt sparas som utkast och kan ändras. Null: allt befintligt är
-- oförändrat.
ALTER TABLE "Survey" ADD COLUMN     "series" TEXT;
