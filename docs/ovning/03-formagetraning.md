# Förmågeträning (steg 2: kärnbygget)

Övningsmodul för delfärdigheter i orsaks- och konsekvensresonemang (Historia 1b,
pilot HT26). Designbeslut och taxonomi finns i vaultet:
`wiki/topics/Formagetraningens-utvecklingsplan-2026-07.md` respektive
`wiki/topics/Delfardighetstaxonomin-operationaliserad.md`.

## Datamodell

- `Question.type` utökad med `SORTING` (dra/tryck-kategorisering, självrättande).
- `Question.subskill`: delfärdighet - `kategorisera | kedjor | forgrena | vikta | kritisera`.
  `FREE_TEXT` + `subskill` = fritextövning med AI-feedback.
- `Question.config` (JSON): för SORTING `{ categories: string[], items: [{ text, category }] }`.
- `Question.exemplars` (JSON): `[{ level: "E"|"C"|"A", text, kommentar }]` -
  exempelsvar som visas EFTER elevens försök (aldrig före; facit och exemplar
  når aldrig klienten innan svaret är inskickat, se `stripSortingFacit`).
- `PracticeAttempt.aiFeedback`: sparad AI-återkoppling per försök.

## Flöde

1. Eleven hittar övningar under `/student/formagor` (grupperat per topic) -
   fritt tillgängligt, styrs inte av FSRS-schemat.
2. Efter första försöket går frågan in i den vanliga FSRS-poolen och
   återkommer under "Att öva på" som allt annat.
3. Sortering rättas av servern per item; fel ger "Om igen" och omkörning i
   passet, precis som flerval.
4. Fritext: svaret skickas till `POST /api/student/practice` som (a) hämtar
   AI-feedback i realtid, (b) returnerar exempelsvaren. Eleven jämför och
   sätter hela FSRS-betyget själv (Om igen/Svårt/Bra/Lätt) - självbedömning
   mot modell är det pedagogiska kärnmomentet.

## AI-feedback (`src/lib/ai-feedback.ts`)

- OpenRouter, modell via env: `OPENROUTER_API_KEY` + `AI_FEEDBACK_MODEL`
  (default `anthropic/claude-haiku-4.5`; nivådelad modellstrategi avgörs i
  steg 3:s blindtest).
- Prompten byggs ur delfärdighetens kriterier i `src/lib/formaga.ts`
  (`SUBSKILL_CRITERIA`, `KVALITETSSPRANG`).
- Formatet är låst: "Styrka: ..." + "Nästa steg: ..." - en styrka, EN
  förbättring, aldrig nivåord, ingen elevidentitet i anropet.
- Saknas nyckel eller fallerar anropet fortsätter övningen utan AI-feedback.

## Import

CSV-kolumner utöver de gamla: `subskill`, `config` (JSON), `exemplars` (JSON).
Ogiltig JSON eller okänd delfärdighet avvisar hela importen med radfel -
inget tappas tyst. SORTING utan subskill får `kategorisera` som default.
Gäller alla fyra importvägarna (questions/import x2, surveys/import, units).

## Avgränsningar (medvetna)

- SORTING/fritextövningar är övningsmaterial - lägg dem inte i skarpa
  quiz/surveys; StudentQuizForm renderar dem som vanlig fritext.
- Kedjebyggaren (graf-UI) kommer i steg 5; kedjor övas tills dess som ren
  fritext med AI-feedback.
- Dashboard för lärarens mönsteranalys byggs sist (steg 6); tills dess MCP.
