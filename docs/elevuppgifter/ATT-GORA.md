# Att göra - survey-platform (backlog)

Saker som medvetet skjutits upp. Återkom hit före go-live.

## Aktivt - återkom hit

- [ ] **Hela momentet (elevvyer) - PLAN KLAR 2026-05-31.** Momentväg (tidslinje) + uppgiftsflöde för eleven, från designhandoff i `C:\Brain\design_handoff_hela_momentet`. Jämförelse + 6-fasplan i `05-hela-momentet-implementation.md`. Kärnfynd: designens `Module/Lesson`-tabeller ska INTE byggas - `Unit`+`lessons`-JSON räcker. Låsta beslut: StudentSidebar (designtroget), datum redigerbara i admin (nytt gränssnitt), Variant B/A som default. Enda migrationen: `Unit.period`/`goals` (kräver maskin utan 5432-block).
  - **Fas 1 (data) - KOD KLAR 2026-05-31, ej committad/deployad.** `period String?` + `goals String[] @default([])` på `Unit` (BÅDA schemana root+mcp-server); handskriven migration `20260531120000_unit_moment_meta` (verifierad byte-identisk med Prismas migrate diff); `LessonOutline` fick `date?`+`week?` (root student-page + mcp import-moment); `import_moment` (funktion+zod+anrop) tar nu valfritt date/week per lektion + period/goals. Root-klient regenererad OK. **COMMITTAD+PUSHAD 2026-05-31 (commit `981afc6`, main), Vercel-deploy triggad -> migrate deploy applicerar på prod.** ÅTERSTÅR (separat, för att MCP-verktyget ska skriva fälten): stäng Claude Code -> `cd mcp-server && npx prisma generate && npm run build`. Nästa kodfas: Fas 2 (status-helper).
  - **Fas 2 (status-helper) + Fas 3 (Momentvägen) - KLARA 2026-05-31.** Fas 2: `src/lib/moment-status.ts` (`deriveTaskStatus`/`buildMomentState`/`parseLessonDate`, `MISSED_AFTER_DAYS=7`), 14/14 assertions pass. Fas 3: `student/moment/[unitId]/page.tsx` omskriven till Variant B-tidslinje (hero+mål, framstegsmätare, veckogruppering, noder, utfälld aktiv lektion, missad-nudge), wirar in helpern. tsc+eslint grönt. Ej renderad lokalt (5432-block) -> visuell koll på deploy.
  - **Fas 4 (Uppgiftsflödet) KLAR 2026-05-31.** Ny route `att-gora/page.tsx` (Variant A: summeringsruta + Gör härnäst/Missat/Kommande/Klart), delad `src/components/moment-icons.tsx`, Fas 3-sidan refaktorerad (importerar ikoner) + navlänkar till att-göra. tsc+eslint grönt. Fas 1-4 deployade (commits 981afc6, f6d9b68, f416b1f).
  - **Fas 5 (StudentSidebar + layout) KLAR 2026-05-31, EJ committad.** Bytt elevskalet topbar->sidebar. `BaseSidebar` utökad additivt (badge på länkar + footerContent; admin opåverkad), ny `StudentSidebar.tsx` (Hem/Mina resultat/Feedback m. olästa-badge, fot "Elev #N"+Logga ut), `student/layout.tsx` omskriven till sidebar-skal (max-w-3xl). Designens momentscopade länkar (Momentet/Att göra/Att öva på/Kurser) utelämnade - bara globala rutter i sidebaren. tsc+eslint grönt; visuell regressionskoll (alla elevsidor) på deploy.
  - **Fas 6 (polish) KLAR 2026-05-31, EJ committad.** Ny `src/lib/moment-scoring.ts` (`quizResult`->"8/8", `draftProgress`->"11/14"); `buildMomentState` fick genomsläpp `result?`/`progress?`; båda elevsidorna hämtar nu answers.isCorrect (senaste resp. vinner) + draft-answers, visar exakt resultat på klara + "Pågår 11/14" på aktiva. tsc+eslint grönt, 15/15 assertions (inkl. regression). **HELA MOMENTET-FEATUREN (Fas 1-6) KODKLAR.** Enda kvar i ursprungsplanen: Fas 1b (admin-gränssnitt för lektionsdatum/period/goals - finns ej, krävs för att missed/upcoming/veckor ska få verkliga datum). Fas 1-5 deployade (981afc6, f6d9b68, f416b1f, 46b67ba); Fas 6 EJ committad.

- [x] **import_moment - KLART 2026-05-31.** Omstart av Claude Code laddade de nya MCP-verktygen (stale-process-blockern borta). `import_moment` + `get_moment_report` körda skarpt mot prod och verifierade. Första momentet importerat: **unitId=1 "Den mörka medeltiden"** i kurs 1 (Hi 1b MEK24B), 8-lektionsbåge + 10 uppgifter (2 QUIZ + 8 fritext-exit-tickets). Elev-momentsida `/student/moment/1`. Detta slutförde också praxistestets Steg 5b. Diagnostikskript: `mcp-server/scripts/list-courses.mjs`, `verify-unit.mjs`. Nästa: skarpt elevtest (dela momentlänken) -> riktig lärarrapport via get_moment_report.

## Innan appen tas i bruk live (om några månader)

- [ ] **Task 1: Säker DB-miljö (UPPSKJUTEN 2026-05-30).** Sätt upp en Neon dev-branch + backup-rutin så schemaändringar kan testas innan de når prod.
  - **Varför uppskjuten:** appen går inte live på flera månader och inga elever använder den ännu, så vi applicerar migrationer direkt mot prod tills vidare. Användaren är bekväm med det i nuläget.
  - **MÅSTE vara på plats innan live** - då är prod-direkt inte längre acceptabelt.
  - Redan gjort: `migration_lock.toml` tillagd (commit `be9a78a`); `.gitignore` täcker `.env*`.
  - Kräver: Neon dev-branch (Neon-dashboard eller `neonctl`), och en maskin där TCP 5432 mot Neon inte är blockerad för att köra `prisma migrate` (den här Brain-maskinen kan inte - 5432 blockerat, ingen root-`node_modules`).
  - Detaljer: `docs/superpowers/plans/2026-05-29-elevuppgifter-i-moment.md` Task 1.

## Senare / v2 (från elevuppgifter-planen)

- [ ] App-rapportvy för läraren (v1 = Claude/MCP-rapport räcker; bygg om behovet bevisas).
- [ ] `delete_unit`-MCP-verktyg (tomma moment kan inte städas via MCP i v1).
- [ ] Normalisera `Unit.lessons` (JSON) till en `Lesson`-tabell om behov uppstår.
- [ ] Visa bedömningskriterier för eleven i appen (kräver `Rubric`).
- [ ] Sätt explicit `git config user.email` på den här maskinen (commits blir annars auto-identitet `andkar001@kunskapsforbundet.se`).
