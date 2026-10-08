-- AlterTable: en momentuppgift kan också visas på elevens startsida.
--
-- Uppgifter med unitId visas annars bara inne i momentet. Läraren vill ibland
-- att en sådan uppgift ska synas direkt för alla, bland enkäterna, utan att
-- den lämnar momentet. Default false: allt befintligt är oförändrat.
ALTER TABLE "Survey" ADD COLUMN     "showOnHome" BOOLEAN NOT NULL DEFAULT false;
