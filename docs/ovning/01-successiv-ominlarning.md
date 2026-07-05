# Successiv ominlärning - "Att öva på"

**Datum:** 2026-06-11
**Status:** v1 implementerad
**Forskningsgrund:** Rawson & Dunlosky (2022), "Successive Relearning: An Underexplored but Potent Technique", Current Directions in Psychological Science 31(5). Tre korrekta svar vid spacade tillfällen ger 80 % retention vid 1 veckas fördröjning. Kompletterande: Lyle et al. (2024) 10-procentsregeln för spacing, Brunmair & Richter (2019) tematisk interleaving i humaniora.

## Problem

Elever pluggar inför provet och glömmer sedan. Appens befintliga mekanik förstärker mönstret:

- `mastery.ts` räknar en fråga som behärskad efter **2 rätt i rad oavsett tidpunkt** - två rätt i samma sittning räcker, vilket är exakt det korttidsplugg som ska motverkas.
- Behärskade frågor återkommer **aldrig** - ingen glesning/underhåll.
- "Frågor att repetera" på dashboarden ytar bara frågor vars senaste försök var fel, per quiz. En fråga som besvarats rätt en gång försvinner ur sikte.

## Lösning: successiv ominlärning

En fråga som eleven någon gång missat (fel eller "Jag är inte säker") hamnar i **övningspoolen** och resurfar tills eleven svarat rätt vid **tre separata dagar** (spacade sessioner). Därefter glesas den ut till underhållsläge och återkommer med långa intervall. Fel svar när som helst nollställer streaken - då lär eleven om (omstudie: rätt svar visas direkt).

### Algoritmen (`src/lib/relearning.ts`)

- **Session = kalenderdag** i Europe/Stockholm. Flera försök samma dag räknas som en session; dagens utfall = sista försöket den dagen.
- **Streak** = antal sammanhängande dagssessioner med rätt svar sedan senaste missen.
- **Gradering** vid streak 3 ("tre rätt före glesning").
- **Due-intervall** (expanderande): streak 0 → 1 dag, streak 1 → 2 dagar, streak 2 → 4 dagar, graderad → 28 dagars underhåll (10-procentsregeln mot läsårsretention).
- **Pass-urval:** max 12 frågor per pass, lägst streak först, mest försenade först, round-robin över topics (tematisk variation, inte slumpmässig blandning).
- Motorn läser **både** skarpa quiz-svar (`Answer` via `Response`) och övningsförsök (`PracticeAttempt`) - ett rätt på ett riktigt quiz räknas som en korrekt session.

### Datamodell

Ny additiv tabell `PracticeAttempt { studentId, questionId, value, isCorrect, createdAt }`. Övningsförsök är **skilda från** `Response`/`Answer`:

- Lärarens statistik (completion, momentrapporter, Elevöversikt) påverkas inte av att elever övar.
- Quiz-svaren förblir den skarpa signalen; övning är elevens egen träningsyta.

### UX

- **`/student/practice`** ("Att öva på"): dagens pass, en fråga i taget, omedelbar feedback med rätt svar efter varje försök (omstudie-komponenten i successiv ominlärning), per-fråga-status "X/3 dagar med rätt", slutsummering.
- **Sidebar:** länken "Att öva på" med badge = antal frågor som är due.
- **Dashboard:** sektionen "Frågor att repetera" ersatt med ett kort som pekar på övningspasset.
- Tom pool → "Inget att öva på idag" + förklaring av när nästa frågor dyker upp.

### Lärarvyn (tillagd 2026-06-11)

**`/admin/courses/[id]/practice`** ("Övning" i kurssidomenyn), byggd på `loadCourseRelearningOverview()`:

- **Statkort:** att öva nu (due totalt), under inlärning, klarade, aktiva övare senaste 7 dagarna.
- **Per-elev-tabell:** due / under inlärning / klarade / övningsförsök 7 d / senast övade. Badge "ej övat" när en elev har due-frågor men inte övat på en vecka - lärarens nudge-signal.
- **Klassens luckor:** frågorna flest elever har under inlärning, med antal redo att öva - toppen är kandidater för helklassgenomgång (missuppfattningskorrigering där den gör störst nytta).
- Aktivitetsstatistiken räknar bara `PracticeAttempt` (elevens egen övning); poolen och statusen räknar som alltid även skarpa quiz-svar.

### Avgränsningar v1

- **Bara MULTIPLE_CHOICE.** Fritext har ingen maskinell rättning; exit tickets ingår inte.
- **Bara frågor eleven mött och missat.** Frågor med rätt på första försöket hanteras av lärarens kumulativa startquiz, inte av övningspoolen.
- `mastery.ts` (per-quiz "Öva igen"-flödet) lämnas orörd i v1 - två parallella system tills relearning visat sig bära. Kandidat för v2: låt relearning-statusen driva även per-quiz-progressbarerna.

### Transparens (pedagogisk not)

Eleverna ska veta varför frågor återkommer: utan metakognitiv förklaring tolkas spacing som tjat och undviks (Pan et al. 2024). Övningssidan har en kort förklaringsrad; läraren förklarar modellen i klassrummet (kopplas till moment 0 "Så funkar glömska" i läsårsskissen för Hi 1b).

## Kursöverskridande övning via länkade elevkonton (tillagd 2026-07-05)

**Behov:** samma elevgrupp läser två kurser hos samma lärare (t.ex. Samhällskunskap 1b + Historia 1b, 2+2 lektioner/vecka = lektionstillfälle 4 av 5 dagar). Övningspasset ska täcka båda kursernas luckor oavsett vilken lektion eleven sitter i - fler spacade repetitionstillfällen per vecka, plus ämnesinterleaving på köpet.

### Modell: personKey

`Student.personKey String?` (additiv migration `20260705120000_student_person_key`). Konton med samma nyckel = samma fysiska elev. Ett konto förblir hårt knutet till sin kurs; länken är ett rent metadata-lager ovanpå.

- **Länkning vid skapande:** admin-elevsidan har valet "Länka mot kurs (samma elever)". `POST /api/courses/[id]/students` tar valfritt `linkCourseId`; elevnummer som finns i länk-kursen får delad `personKey` (befintligt konto får nyckel om det saknar en, i samma transaktion).
- **Sammanslagen pool:** `loadRelearningData()` löser upp länkade konton via `resolveLinkedAccounts()` och laddar försökshistorik för alla. Varje fråga hör till exakt en kurs, så per-fråga-historik blandas aldrig mellan konton. Round-robin över topics ger automatiskt varvning mellan ämnena.
- **Attribution:** `POST /api/student/practice` bokför försöket på kontot i frågans kurs (`ownerStudentId`), oavsett vilket konto eleven är inloggad på. Lärarvyn per kurs förblir därmed korrekt utan ändring.
- **UX:** när poolen spänner över flera kurser visar övningskortet en kursetikett per fråga. Badge och dashboardkort räknar den sammanslagna poolen.

### Avgränsningar

- Länkning sker vid kontoskapande (samma elevnummer i båda kurserna). Ingen efterhands-parning i UI:t ännu - kandidat om behovet uppstår (t.ex. MCP-verktyg eller redigering per elev).
- Eleverna har fortfarande separata inloggningar per kurs; länkningen påverkar bara övningen, inte auth, quiz, feedback eller statistik.
