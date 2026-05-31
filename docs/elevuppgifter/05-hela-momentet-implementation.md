# 05 - Hela momentet (elevvyer): jämförelse + implementationsplan

**Status:** Plan (ej påbörjad). Skapad 2026-05-31.
**Källa:** Designhandoff i `C:\Brain\design_handoff_hela_momentet\` (README + React/Babel-prototyper).
**Bygger vidare på:** elevuppgifter-i-moment (unitId=1 "Den mörka medeltiden" live på prod), `01-frontend-ux.md`, `02-backend.md`, `docs/superpowers/plans/2026-05-29-elevuppgifter-i-moment.md`.

Två nya elevytor ovanpå dagens platta quiz-lista, så eleven kan följa ett *helt moment* över tid:

1. **Momentvägen** - vertikal tidslinje genom momentet, lektion för lektion (uppgradering av befintliga `/student/moment/[unitId]`).
2. **Uppgiftsflödet** - "vad har jag kvar / har jag missat något", uppgifterna statusgrupperade.

Takten är **självgående**: inget låses, lektioner har *rekommenderade* datum, "missad" är en vänlig påminnelse - inte en spärr.

---

## 1. Jämförelse: designens datamodell vs verkligheten

Designhandoffens README antar ett greenfield-schema och föreslår nya tabeller `Module` + `Lesson`. **Den premissen är föråldrad** - kodbasen har redan löst samma problem lättare med `Unit` + `lessons`-JSON + `Survey.lesson`.

| Designens förslag | Finns idag | Bedömning |
|---|---|---|
| `Module`-tabell (moment) | `Unit` | Finns (annat namn) |
| `Module.title` | `Unit.title` | OK |
| `Module.period` | - | Saknas |
| `Module.goals` (lärandemål) | - | Saknas |
| `Lesson`-tabell | `Unit.lessons` (JSON-array `{n,title,note?}`) | Finns som JSON, inte tabell |
| `Lesson.title` / `.order` | `lessons[].title` / `lessons[].n` | OK |
| `Lesson.summary` | `lessons[].note` (valfri) | Återanvänd `note` |
| `Lesson.recommendedAt` (datum) | - | Saknas helt |
| `Survey.lessonId` (FK) | `Survey.lesson` (Int = lektionsnr) | Funktionellt likvärdig |
| Uppgiftstyper (Läsning/Inlämning/Avslut) | Bara Survey = Övning/quiz | Matchar README:s rek (a): börja quiz-bara |
| Status `done/active/todo/missed/upcoming` | `Inlämnad/Utkast/Ej påbörjad` härleds redan | Delvis - saknar missed/upcoming |

**Beslut: bygg INTE `Module`/`Lesson`-tabellerna.** Det vore en överflödig migration som dessutom bryter `import_moment` + `get_moment_report` (kör skarpt på prod). En `Lesson`-tabell står redan som medvetet uppskjuten v2 i `ATT-GORA.md`. Utöka den befintliga strukturen istället.

Verifierat samtidigt:
- README:ns claim att `globals.css` redan har exakt paletten **stämmer** - alla färgtokens + komponentklasser (`.card`, `.btn-primary`, `.btn-accent`, `.badge`, `.animate-fade-in`) finns. Inga nya tokens behövs (ev. `--error-bg: #fbf0ec` för missad-bakgrund).
- En primitiv "Momentväg" finns redan: `src/app/student/moment/[unitId]/page.tsx` grupperar uppgifter per lektion med statusbadge. Designen är en *uppgradering* av den, inte greenfield.
- Statushärledning finns redan på två ställen (submitted=Response, draft=DraftResponse, annars ej påbörjad).
- **Ingen admin-UI för units/lektioner finns** - de skapas bara via MCP `import_moment`. Redigerbara datum kräver alltså ett nytt admin-gränssnitt (se Fas 1b).

---

## 2. Vad som faktiskt saknas

1. **Datum per lektion** - driver `missed`/`upcoming`/`today` + veckogruppering. Enda riktiga datablockeraren.
2. **`period` + `goals` på momentnivå** - för header + "Mål med momentet"-kort.
3. **Status-härledning utökad** - dagens 3 statusar -> designens 5 (behöver datumen).
4. **Layout-skal** - elevsidan är topbar + smal `max-w-2xl`; designen förutsätter sidebar + bredd.
5. **Frontend** - själva vyerna (tidslinjenoder, progress-kort, att göra-grupper, mobil).

---

## 3. Låsta beslut (2026-05-31)

- **Layout:** Bygg `StudentSidebar` (designtroget) ovanpå `BaseSidebar`. Tas som egen fas - störst blast radius (rör hela elevskalet: dashboard, resultat, quiz, feedback).
- **Datum:** Redigerbara i admin efteråt (nytt litet admin-gränssnitt - finns inte idag).
- **Variant-default:** Momentvägen = Variant B (fokuserad/guidad). Uppgiftsflödet = Variant A ("Att göra"-hub).
- **Scope Uppgiftsflödet:** Per moment först (`/student/moment/[unitId]/att-gora`), inte global aggregering över alla moment.

---

## 4. Implementationsplan (faser)

Rekommenderad ordning för minsta risk: **1 -> 2 -> 3 -> 4 -> 6**, med **Fas 5 (sidebar) sist/separat**.

### Fas 1 - Data (S, låg risk, additivt) - KOD KLAR 2026-05-31 (ej committad/deployad)
Gjort: `period String?` + `goals String[] @default([])` på `Unit` i båda schemana; migration `20260531120000_unit_moment_meta` (verifierad byte-identisk med `prisma migrate diff`); `LessonOutline` + `date?`/`week?` i student-page + import-moment; `import_moment` tar nu date/week/period/goals (funktion + zod + anrop); root-klient regenererad. Återstår (Claude Code stängt pga DLL-lås): `cd mcp-server && npx prisma generate && npm run build`, sedan commit+push -> Vercel kör `migrate deploy` mot prod.

- Utöka lektions-shapen i JSON: `{ n, title, note?, date?, week? }`. **Ingen migration** (`lessons` är redan `Json?`). Uppdatera `LessonOutline`-interfacet (finns i `src/app/student/moment/[unitId]/page.tsx` och `mcp-server/src/tools/import-moment.ts`).
- Lägg `period String?` och `goals String[] @default([])` på `Unit`. **En** additiv migration (nullable/default - rör ingen befintlig rad).
  - OBS migrationsbegränsning (se `ATT-GORA.md` Task 1): den här Brain-maskinen kan inte köra `prisma migrate` (TCP 5432 blockerat). Migrationen måste köras från en maskin där 5432 är öppet. Detta är den **enda** migrationen i hela planen - bunta den.
- Uppdatera `import_moment` (MCP) så den valfritt tar emot `date`/`week` per lektion + `period`/`goals` på momentet. Befintliga anrop fungerar oförändrat.

### Fas 1b - Admin: redigera lektionsdatum (S-M, nytt gränssnitt)
- Finns ingen unit-redigering i admin idag. Bygg en fokuserad yta under `src/app/admin/courses/[courseId]/` (t.ex. `units/[unitId]/page.tsx`) där läraren kan sätta/justera `date` per lektion + `period`/`goals`.
- Behöver en server action / API-route som skriver tillbaka till `Unit.lessons` (JSON) + `Unit.period`/`goals`.
- Minsta version: en enkel formulärlista över lektionerna med ett datumfält per rad.

### Fas 2 - Status-helper (S) - KLAR 2026-05-31 (verifierad, ej committad)
Skrivet `src/lib/moment-status.ts`: `deriveTaskStatus()` (done/active/todo/missed/upcoming), `buildMomentState()` (per-lektion-status + "Du är här" + aggregat `MomentStats`), `parseLessonDate()`, `MISSED_AFTER_DAYS=7`. Ren modul, matchar `mastery.ts`-stil. Root `tsc --noEmit` grönt; 14/14 assertions pass mot kompilerad kod (inga datum, datum->missed/upcoming, response/draft-prioritet). Wiras in i vyerna i Fas 3/4.

- Ny `src/lib/moment-status.ts`. Funktion `(survey, response?, draft?, lessonDate?, today) -> done|active|todo|missed|upcoming`.
  - `done` = Response finns · `active` = Draft men ingen Response · `upcoming` = lektionsdatum > idag & ej start · `missed` = datum < idag - tröskel & ej start · `todo` = annars.
  - "Du är här"-lektion = första icke-klara lektionen.
- Aggregatfunktion per moment (procent, klara/att göra/missade/kommande) - motsvarar `M_STATS` i prototypens mockdata.

### Fas 3 - Momentvägen (M) - KLAR 2026-05-31 (tsc+eslint grönt, ej visuellt testad)
Skrivit om `student/moment/[unitId]/page.tsx` till Variant B-tidslinjen: hero (mono course·MOMENT·period, titel, lärandemål ur `unit.goals`), slim framstegsmätare (percent+bar+klara/att göra/missad + "Fortsätt"-knapp till resume-task), missad-nudge, veckogrupperad tidslinje (faller tillbaka till en grupp om `week` saknas), noder (done=grön check / current=accent+glow / upcoming=ofylld), aktiv lektion utfälld i primärkant-kort, "Övriga uppgifter" för loose surveys. Wirar in `buildMomentState`. Inline-SVG-ikoner, `font-mono`-etiketter, era Tailwind-tokens. Root når ej DB lokalt (5432) -> visuell verifiering på deploy.

- Uppgradera `src/app/student/moment/[unitId]/page.tsx` till tidslinjen, **Variant B** som default.
- Tidslinjenoder (klar=grön check, aktiv/idag=accent + glow-ring, kommande=ofylld), "Du är här"-chip, veckoavdelare, aktiv lektion utfälld i upphöjt kort, progress-kort + mål-kort.
- Översätt `design/variants/moment-path.jsx` till era Tailwind-klasser (prototypen använder inline-styles + serif-skin - använd `font-sans`/`font-mono`, inte Fraunces).

### Fas 4 - Uppgiftsflödet (M) - KLAR 2026-05-31 (tsc+eslint grönt, ej visuellt testad)
Ny route `student/moment/[unitId]/att-gora/page.tsx` (Variant A): mono-header + ingress, 4-kolumns summeringsruta (att göra/missade/klara/kommande), grupperna **Gör härnäst** (stora kort med statusprick + lektion-kontext + Börja/Fortsätt), **Missat - ta igen** (rosa kort, Ta igen-knappar), **Kommande** (dämpad), **Klart**. Återanvänder `buildMomentState` + berikar varje task med lektionskontext (titel/vecka/datum) via join mot `moment.lessons`. Ikoner extraherade till delad `src/components/moment-icons.tsx` (Check/ArrowRight/Flag/Clock/Dot); Fas 3-sidan refaktorerad att importera dem + fick navigeringslänkar till att-göra (meter-länk + "Visa" i missad-nudgen). tsc+eslint grönt.

- Ny route `src/app/student/moment/[unitId]/att-gora/page.tsx`, **Variant A** (Gör härnäst / Missat - ta igen / Kommande / Klart).
- Återanvänder status-helpern från Fas 2. Översätt `design/variants/moment-tasks.jsx`.

### Fas 5 - Layout + sidebar + mobil (M, störst blast radius) - KLAR 2026-05-31 (tsc+eslint grönt, ej visuellt testad)
Bytt elevskalet från topbar + `max-w-2xl` till sidebar-skal. `BaseSidebar` utökad additivt (admin opåverkad): `badge?` på länkar + valfri `footerContent`. Ny `src/components/StudentSidebar.tsx` (klient): länkar Hem / Mina resultat / Feedback (olästa-badge), header = kursnamn, footer = "Elev #N" + Logga ut. `student/layout.tsx` omskriven (server: hämtar olästa feedback + kursnamn), `flex md:flex-row` + `main` med `max-w-3xl` (768px - kompromiss; designens 940-1100 kan tas senare). Mobil-hamburgare via BaseSidebar. OBS avvikelse mot designens sidebar-länkar: "Momentet/Att göra/Att öva på/Kurser" utelämnade - de är momentscopade (finns på moment-sidorna) eller saknar route; sidebaren håller bara globala, fungerande rutter. SESSIONEN saknar elevnamn (bara `studentNumber`) -> fot visar "Elev #N". Mobilvy-prototypen (moment-mobile.jsx) ej separat byggd - de responsiva vyerna + BaseSidebar-hamburgaren täcker mobilen. Regressionsrisk: alla elevsidor (dashboard/resultat/quiz/feedback) renderas nu i sidebar-skal -> visuell koll på deploy.

- Bygg `StudentSidebar` ovanpå `BaseSidebar` (analogt med `src/components/CourseSidebar.tsx`). Länkar: Momentet, Att göra (badge = kvar + missade), Resultat, Att öva på, Kurser.
- Byt `src/app/student/layout.tsx` från topbar + `max-w-2xl` till sidebar-skal (bredd ~940-1100px för innehåll). Mobil-hamburgaren finns redan i `BaseSidebar`.
- Mobilvyer (`design/variants/moment-mobile.jsx`): grön header-block + framstegsbar + kolumnlayout.
- Påverkar ALLA elevsidor - regressionstesta dashboard/resultat/quiz/feedback.

### Fas 6 - Polish (S) - KLAR 2026-05-31 (tsc+eslint grönt, 15/15 assertions)
Ny `src/lib/moment-scoring.ts`: `quizResult(answers)` -> "8/8" (räknar bara flervalssvar med boolean isCorrect; fritext=null hoppas -> null), `draftProgress(answersJson, total)` -> "11/14" (räknar ifyllda nycklar i DraftResponse.answers-JSON). `buildMomentState`/`SurveyInput`/`TaskState` fick genomsläpp `result?`/`progress?` (statuslogiken rör dem ej). Båda sidorna (Momentvägen + Uppgiftsflödet) hämtar nu responses med `answers.isCorrect` (senaste vinner) + drafts med `answers`, beräknar maps och matar in. Visning: done-uppgift visar "8/8" (annars "Klar"), aktiv visar "Pågår 11/14". `.animate-fade-in` + missad-banner redan på plats sedan Fas 3. Statushelper-regression verifierad (15/15 assertions inkl. scoring + threading).

---

## 5. Effort-grov

| Fas | Storlek | Risk |
|---|---|---|
| 1 Data | S | Låg (1 additiv migration) |
| 1b Admin-datum | S-M | Låg (nytt men isolerat) |
| 2 Status-helper | S | Låg |
| 3 Momentvägen | M | Låg (uppgradering) |
| 4 Uppgiftsflödet | M | Låg |
| 5 Sidebar+layout | M | **Medel** (hela elevskalet) |
| 6 Polish | S | Låg |

---

## 6. Uppskjutet / utanför scope

- Uppgiftstyper Läsning/Inlämning/Avslut (designen visar dem) - börja quiz-bara per README rek (a). Inför `Activity.kind` senare om behov.
- Global "Att göra" över alla moment (designens `/student/att-gora`) - per-moment först.
- `Lesson`-tabell (normalisera bort JSON) - kvarstår som v2 i `ATT-GORA.md`.
- Designens Fraunces/JetBrains Mono-skin - behåll Bricolage/Geist.

---

## 7. Berörda filer (referens)

- `prisma/schema.prisma` - `Unit.period`/`goals` (Fas 1).
- `src/app/student/moment/[unitId]/page.tsx` - Momentvägen (Fas 3).
- `src/app/student/moment/[unitId]/att-gora/page.tsx` - NY (Fas 4).
- `src/lib/moment-status.ts` - NY (Fas 2).
- `src/components/StudentSidebar.tsx` (eller motsv.) - NY (Fas 5); `src/app/student/layout.tsx` - omskrivning.
- `src/app/admin/courses/[courseId]/units/[unitId]/page.tsx` - NY admin-datum (Fas 1b).
- `mcp-server/src/tools/import-moment.ts` - datum/period/goals (Fas 1).
- Prototyper att översätta: `C:\Brain\design_handoff_hela_momentet\design\variants\{moment-path,moment-tasks,moment-mobile}.jsx`.
