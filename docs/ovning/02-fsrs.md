# FSRS-schemaläggare - "Att öva på" i Anki-stil

**Datum:** 2026-07-05
**Status:** v2 implementerad (ersätter streakmodellen i `01-successiv-ominlarning.md`, som behålls som historik)
**Algoritm:** FSRS-6 via npm-paketet `ts-fsrs` (5.4.1) - samma algoritm som är standard i Anki sedan 23.10.

## Vad som ändrades mot v1

| | v1 (streakmodell) | v2 (FSRS) |
|---|---|---|
| Pool | Bara frågor eleven någon gång missat | **Alla mötta flervalsfrågor** (quiz eller övning) |
| Intervall | Fast stege 1/2/4 dagar, sedan 28 dagars underhåll | Individuellt per fråga, växer med minnesstabiliteten, max 120 dagar |
| Betyg | Auto rätt/fel | Fel/osäker = "Om igen" automatiskt; rätt svar självskattas **Svårt/Bra/Lätt** med intervallförhandsvisning per knapp |
| Fel i passet | Frågan väntar till nästa dag | **Omkörning i samma pass**: frågan läggs sist i kön tills den besvarats rätt en gång |
| Klar-tröskel | 3 rätta dagssessioner ("graduated") | **Behärskad** = schemalagt intervall >= 7 dagar och senaste betyg inte "Om igen" |
| Passtak | 12 frågor | 20 frågor |

## Parameterval (`src/lib/relearning.ts`)

- `request_retention: 0.9` - 90 % målretention, FSRS-default och Ankis rekommendation.
- `maximum_interval: 120` - läsårshorisont; aldrig mer än ~4 månader mellan repetitioner. OBS: ts-fsrs monotoniregel (hard < good < easy efter cappning) kan ge upp till 2 dagar över taket.
- `enable_fuzz: false` - replay och tester måste vara bit-för-bit-reproducerbara.
- `enable_short_term: false` - **long-term-schemaläggaren**: alla intervall >= 1 dag, vilket matchar appens dagsgranularitet. Samma-dag-repetition sköts av klientens passkö, inte av schemaläggaren. Viktigt: i det här läget är ts-fsrs `State`-fält degenererade (allt blir Review), därför härleds "behärskad" ur intervallet i stället.
- Default FSRS-6-vikter - ingen per-elev-optimering vid <100 elever.

## Replay-design (stateless)

Ingen kortstatus persisteras. Varje frågas FSRS-kort byggs vid läsning genom att folda hela försökshistoriken kronologiskt genom `scheduler.next()`:

- **Källor:** skarpa quiz-svar (`Answer` + `Response.createdAt`) och övningsförsök (`PracticeAttempt`). Skarpa quiz påverkar därmed schemat automatiskt utan synk-kod.
- **Betygsmappning:** `PracticeAttempt.grade` (1-4, ts-fsrs `Rating`) om satt; annars härlett: rätt -> Bra (3), fel/"Jag är inte säker"/orättbar -> Om igen (1). Täcker både quiz-svar (har aldrig grade) och övningsförsök från streak-eran (grade NULL).
- **Tie-break** vid identisk tidsstämpel: quiz-svar före övningsförsök, sedan insättningsordning. Deterministiskt.
- Länkade konton (`Student.personKey`) fungerar oförändrat: varje fråga hör till exakt en kurs och försöket bokförs på kontot i frågans kurs.

## Tvåfas-API (`/api/student/practice`)

1. **POST** `{questionId, value}` - servern rättar, sparar försöket med defaultbetyg (rätt -> Bra, fel/osäker -> Om igen) och svarar med `attemptId`, rättningsresultat och intervallförhandsvisningar `{hard, good, easy}` beräknade ur historiken före försöket.
2. **PATCH** `{attemptId, grade: 2|3|4}` - självskattningen. Vakter: ägarskap via länkade konton, bara `isCorrect = true`, max 10 minuter gammalt, bara grade-kolumnen. "Bra" kräver inget PATCH; uteblivet anrop lämnar Bra - Ankis vanligaste svar och rätt default.

## Utrullningsnot (dag ett, väntat beteende)

Vid deployen replayas månader av historik: alla frågor eleverna någonsin besvarat kommer in i poolen och många är rejält försenade. Due-badgen kan visa stora tal första dagarna. Passet är cappat till 20 och sorterar svagast retrievability först; rätt svar på länge försenade kort ger stora stabilitetslyft, så backloggen betas av på några dagar av sig själv. Inte en bugg.

## Pedagogisk kontinuitet

v1:s forskningsgrund (Rawson & Dunlosky: spacade korrekta repetitioner; Brunmair & Richter: tematisk interleaving) bärs vidare: round-robin över topics finns kvar i passurvalet, omstudiekomponenten (rätt svar visas direkt vid fel) finns kvar, och transparensprincipen (eleven ska veta varför frågor återkommer) finns kvar i copy på övningssidan. FSRS tillför individuell anpassning per fråga och elev - precis det en fast stege inte kan - samt metakognitiv träning via självskattningen.
