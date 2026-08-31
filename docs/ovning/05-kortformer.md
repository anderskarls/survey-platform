# Kortformer - glosekort och luckmeningskort

**Datum:** 2026-08-30
**Status:** implementerad
**Forskningsgrund:** Produktion före igenkänning (Karpicke & Roediger 2008); kontextualiserad glosinlärning ger bättre transfer än ordpar i isolering (Webb 2007). Kortet självskattas, vilket är Anki-modellen som redan bär glosekorten - se `02-fsrs.md`.

## Två kort och en icke-kort

| Typ | Framsida | Baksida | Vem dömer | I övningspoolen |
|---|---|---|---|---|
| `MULTIPLE_CHOICE` i flashcardläge | Frågan/glosan | Rätt alternativ | Eleven (självskattning) | Ja |
| `CLOZE_CARD` | Meningen med luckan tom | Samma mening, ordet ifyllt | Eleven (självskattning) | Ja |
| `CLOZE` | Meningen med ett inmatningsfält | - | Servern (exakt stavning) | **Nej** |

Gränsen mellan de två luckformerna är avsiktlig och är hela skälet till att `CLOZE_CARD` är en egen typ i stället för ett presentationsläge på `CLOZE`:

- **Luckfrågan är mätning.** Eleven producerar ordet och stavningen rättas exakt. Den ligger i veckotestet och ska inte kunna självskattas.
- **Luckmeningskortet är träning.** Eleven fyller luckan i huvudet, vänder kortet och skattar sig själv. Det ligger i övningen och ska komma tillbaka enligt FSRS.

Hade `CLOZE` renderats som kort i flashcardkurser hade veckotesten i kurs 13 och 38 börjat självskatta sig i samma stund som kursen fick sitt första kort.

## Var gränsen dras i koden

- `CARD_TYPES` i `src/lib/flashcard.ts` är listan över vad som räknas som kort. Den styr övningspoolen (`relearning-data.ts`), veckans övning (`week-practice-data.ts`) och lärarvyns översikt.
- `rendersAsCard(type, flashcardMode)`: flervalsfrågan blir kort bara i kurser med flashcardläge; luckmeningskortet är kort i kraft av sin typ, oavsett kurs.
- `cardBack(question, flashcardMode)` ger baksidan: rätt alternativ respektive `config.answer`.
- Facit reser olika i de två flödena. I **enkäter** följer baksidan med sidladdningen - kortet ska kunna vändas utan nätverksanrop, och eleven skattar sig ändå själv. I **övningen** lämnar baksidan servern först efter att försöket är sparat (`POST /api/student/practice` svarar med `correctAnswer`), samma regel som för sorteringsfacit.

## Datamodell

Luckmeningskortet återanvänder luckfrågans config utan tillägg:

```json
{ "answer": "influence", "accept": ["influences"], "hint": "Inflytande / Påverkan" }
```

`accept` används inte av kortet (ingen rättning sker) men skadar inte, vilket gör att ett kort kan skapas som en rak kopia av en luckfråga. Ledtråden visas på framsidan.

Skattningen sparas som `Answer.value` / `PracticeAttempt.value` = `__FC_GOOD__` m.fl. med FSRS-betyget i `grade`, precis som glosekortens. Kortet och luckfrågan är två frågor med varsin historik: samma mening övas som kort och mäts i veckotestet utan att flödena stör varandra.

## Skapa kort

CSV (`import_questions`, `create_quiz_from_csv`, adminimport):

```csv
topic,type,text,config
"Vecka 01",CLOZE_CARD,"Her ___ on the whole group was obvious.","{""answer"":""influence"",""hint"":""Inflytande / Påverkan""}"
```

Ur befintliga luckfrågor, för kurser som redan har en frågebank:

```bash
node mcp-server/scripts/make-cloze-cards.mjs <kursId> --dry-run
```

Skriptet kopierar varje `CLOZE` i kursen till ett `CLOZE_CARD` i samma ämne (idempotent - kan köras om när nya veckor tillkommit). Med `--suffix " - kort"` hamnar korten i ett eget ämne per vecka, som då måste öppnas för sig.
