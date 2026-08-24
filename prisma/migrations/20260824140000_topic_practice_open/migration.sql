-- AlterTable: läraren öppnar ett topic för övning.
--
-- Utan flaggan kan en fråga bara nå övningspasset genom att eleven först
-- mött den i ett quiz. Kurser där glosorna övas i stället för att provas
-- behöver en väg in för aldrig mötta frågor - läraren öppnar en vecka i
-- taget så att korten alltid kommer före veckotestet.
--
-- Default false: befintliga kurser fortsätter exakt som förut, där poolen
-- är de frågor eleven mött.
ALTER TABLE "Topic" ADD COLUMN "practiceOpen" BOOLEAN NOT NULL DEFAULT false;
