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
4. Fritext: svaret sparas via `POST /api/student/practice` som returnerar
   exempelsvaren direkt. Eleven jämför och sätter hela FSRS-betyget själv
   (Om igen/Svårt/Bra/Lätt) - självbedömning mot modell är det pedagogiska
   kärnmomentet. Feedback på svaret kommer asynkront (se nedan) och visas
   under "Återkoppling på dina resonemang" på `/student/formagor`.

## Feedback via CLI-flödet (ingen server-side LLM)

Servern anropar aldrig någon LLM. Feedback genereras av läraren via
survey-platform-CLI:n (printing-press), samma mönster som enkätfeedbacken:

- `GET /api/practice/feedback` (CLI: `practice get-pending-feedback`,
  valfritt `--course-id`): fritextförsök utan feedback, grupperade per
  fråga. Svaret bär **hela promptunderlaget**: delfärdighetens
  kvalitetskriterier (`kriterier` per fråga, ur `SUBSKILL_CRITERIA` i
  `src/lib/formaga.ts`), de tre kvalitetssprången och feedbackreglerna
  (`FEEDBACK_REGLER`). Ingen elevidentitet exponeras - bara attempt_id.
- `POST /api/practice/feedback` (CLI: `practice submit-feedback`):
  `{feedbacks: [{attempt_id, feedback}]}` skriver
  `PracticeAttempt.aiFeedback`. Bara förmåga-fritextförsök accepteras.
- Formatet är låst: "Styrka: ..." + "Nästa steg: ..." - en styrka, EN
  förbättring, aldrig nivåord. Reglerna följer med i pending-svaret så att
  generatorn aldrig arbetar utan dem.
- Tänkt drift: körs i lärarens Claude Code-flöde (t.ex. den dagliga
  survey-feedback-agenten), som redan gör motsvarande för enkätsvar.

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
