# Lärarroll med kursomfång, upplöst ur databasen vid varje anrop

Adminbehörigheten var binär: `Admin`-tabellen hade e-post, namn och lösenordshash men ingen roll och ingen koppling till kurs, och `requireAdmin()` kontrollerade bara *att* anroparen var inloggad. Vilken rad som helst i tabellen nådde varje kurs. När en kollega behövde egen åtkomst till en enda kurs (Engelska 5) fanns inget sätt att ge den utan att också ge bort allt annat.

Beslutet: en `AdminRole`-enum (`OWNER` / `TEACHER`) på `Admin` plus en kopplingstabell `AdminCourse`. Ett lärarkonto får **full paritet på sina kurser** - samma redigering, samma export, samma feedback som ägaren har - men når ingenting utanför dem.

Tre val i genomförandet är värda att skriva ned, för de är de som inte är självklara:

**Omfånget läses ur databasen vid varje anrop, inte ur JWT:n.** Sessionen bär bara identiteten; rollen och kurslistan slås upp i `getAdminScope()`. Det kostar en fråga per anrop. Alternativet - att lägga kurslistan i token - hade varit gratis men gjort varje indragen behörighet verkningslös tills kontot loggar ut, och ett borttaget konto giltigt tills cookien gick ut. En behörighet som dröjer är ingen behörighet.

**`courseIds: null` betyder alla kurser, `[]` betyder inga.** Skillnaden är betydelsebärande och får aldrig kollapsa till en falsy-koll. Ett tomt filter i Prisma matchar *allt*; en nyanställd lärare utan tilldelade kurser måste därför ge `{ courseId: { in: [] } }` och noll träffar, inte `{}` och hela plattformen. Det är den felmod som skulle vara tystast och värst, och den har egna tester.

**De globala vyerna filtreras i stället för att stängas.** `/admin/questions` och `/admin/surveys` visar data tvärs över kurser. De kunde ha gjorts ägarexklusiva, vilket vore lättare att gardera. Valet blev filtrering, så att en lärare får samma app som ägaren och inte en stympad variant. Priset är att varje global route måste bära sitt filter: `Survey` och `Topic` via `courseId`, `Question` via `topic.courseId`. Missas ett läcker vyn.

## Consequences

- **`ADMIN_API_KEY` behåller obegränsad åtkomst.** Den är en delad nyckel utan identitet och används av CLI:n och MCP-servern. Kursbegränsningen gäller alltså webbgränssnittet; nyckeln får inte delas ut till ett lärarkonto. Ska en lärare någon gång nå API:t krävs per-konto-nycklar - det är inte byggt.
- **MCP-servern går direkt mot `DATABASE_URL`** och förbi hela app-auktoriseringen. Samma sak där: dess token (`MCP_HTTP_TOKEN`) är ägarens.
- **Migrationen sätter alla befintliga konton till `OWNER`.** Schemats default är `TEACHER` så att ett konto som skapas någon annan väg blir det snävaste, men utan den raden i migrationen hade ägaren låst ut sig själv i samma andetag som rollen infördes.
- **Kursåtkomst kontrolleras på två ställen, inte trettio.** `requireCourseAccess(params)` i alla routes under `/api/courses/[courseId]/`, och `requireCoursePage()` i `admin/courses/[courseId]/layout.tsx` som alla undersidor ärver. En ny sida under kursen behöver därför inget eget skydd - en ny *global* route behöver det däremot alltid.
- **Ett saknat objekt ger samma 403 som ett otillåtet**, och en otillåten kurs visas som 404 på sidnivå. Att skilja på fallen vore en orakelfunktion: prova kurs-id efter kurs-id och läs av vilka som finns.
- Konton administreras med `scripts/manage-teacher.ts` (`npm run teacher`). Ingen adminsida för det är byggd - det var ett medvetet steg-två.
