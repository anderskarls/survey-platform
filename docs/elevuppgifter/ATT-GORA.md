# Att göra - survey-platform (backlog)

Saker som medvetet skjutits upp. Återkom hit före go-live.

## Aktivt - återkom hit

- [ ] **ÅTERKOMMA: import_moment.** Pausad 2026-05-30 (jobbar med design just nu). Bygget är redan gjort (2026-05-30 09:53 - dist/ + Prisma-klient har Unit-modellen). ENDA blockern: MCP-servern i den körande Claude Code-sessionen är stale (startad före bygget) så de nya verktygen syns inte. **Fix: starta om Claude Code => `import_moment` + `get_moment_report` laddas. Ingen extern build behövs.** Verifiera sedan `import_moment` skarpt mot prod och skjut in ett riktigt moment.

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
