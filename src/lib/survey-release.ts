/**
 * Släpptidpunkt för enkäter - vad eleven ser, och när.
 *
 * `Survey.openAt` är en riktig spärr, till skillnad från lektionsdatumen i
 * moment-status.ts som bara är rekommendationer ("self-paced model: nothing
 * is ever locked"). Skillnaden är avsiktlig: ett veckotest mäter veckans ord,
 * och mätningen tappar sitt värde om hela ordbanken går att läsa i förväg.
 *
 * Två regler bär hela funktionen:
 *   - `openAt === null` betyder öppen direkt. Allt som fanns före fältet, och
 *     varje kurs som inte schemalägger, beter sig exakt som förut.
 *   - En gång släppt förblir släppt. Det finns inget `closeAt` - eleven som
 *     varit sjuk ska kunna ta igen veckan efter.
 *
 * Utöver det finns ett tredje läge, MANUELLT: enkäten är dold tills läraren
 * själv trycker "Släpp nu". Det bärs av samma fält - en tidpunkt så långt
 * fram att den aldrig passerar av sig själv - i stället för av en egen kolumn.
 * Skälet är att spärren då redan gäller överallt där `isReleased` används:
 * elevvyerna, delningslänken, respond- och draft-endpointen. En ny kolumn
 * hade krävt att varje sådant ställe kom ihåg den. Det som skiljer manuellt
 * från schemalagt är bara vad läraren och eleven får läsa - därav
 * `isManualRelease` och `releaseNotice` nedan.
 *
 * Spärren måste hållas på servern. Elevvyerna döljer det oöppnade, men det är
 * `respond`- och `draft`-endpointen som avgör saken; en delningslänk räcker
 * annars för att svara på nästa veckas test.
 */

export interface Releasable {
  openAt: Date | null;
}

/** Har enkäten släppts? Otidsatt enkät är alltid öppen. */
export function isReleased(survey: Releasable, now: Date = new Date()): boolean {
  return survey.openAt === null || survey.openAt.getTime() <= now.getTime();
}

/**
 * Går enkäten från stängd till öppen med den här ändringen?
 *
 * Släppet är ögonblicket då veckans ord blir elevens - och sedan 2026-08-31
 * öppnas veckans övning i samma andetag (se openPracticeForRelease i
 * survey-edit.ts). Skälet är ett fynd i Veckotest 01: ingen vecka var öppen
 * för övning, så testet mätte förkunskap i stället för inlärning.
 *
 * Bara övergången räknas. Ett redan släppt test som får en ny titel ska inte
 * öppna någonting på nytt, och ett test som skjuts framåt stänger ingenting -
 * en gång släppt förblir släppt, och samma återvändo gäller övningen.
 */
export function isBeingReleased(
  before: Releasable,
  after: Releasable,
  now: Date = new Date()
): boolean {
  return !isReleased(before, now) && isReleased(after, now);
}

/**
 * Tidpunkten som betyder "läraren öppnar själv". Skrivs av lärardashboarden;
 * läses via isManualRelease, aldrig genom jämförelse på det här värdet.
 */
export const MANUAL_RELEASE_AT = new Date("2099-01-01T00:00:00.000Z");

/**
 * Väntar enkäten på lärarens knapptryck i stället för på ett datum?
 *
 * Gränsen är ett årtal, inte exakt likhet med MANUAL_RELEASE_AT: en tidpunkt
 * bortom 2090 kan inte vara ett läsårsschema någon menat allvarligt, och en
 * gammal sentinel med annat klockslag ska läsas rätt ändå.
 */
export function isManualRelease(survey: Releasable): boolean {
  return survey.openAt !== null && survey.openAt.getUTCFullYear() >= 2090;
}

/**
 * Vad eleven ska få läsa om en enkät som inte är öppen än. Ett datum när det
 * finns ett, annars beskedet att läraren öppnar - aldrig sentineldatumet, som
 * bara skulle förvirra.
 */
export function releaseNotice(survey: Releasable): string {
  if (survey.openAt === null) return "Öppen";
  return isManualRelease(survey)
    ? "Öppnas när läraren släpper den"
    : `Öppnar ${formatRelease(survey.openAt)}`;
}

/**
 * Prisma-fragment för "bara det som släppts".
 *
 * Kombineras med övriga villkor: `where: { courseId, ...releasedWhere() }`.
 * Kan inte slås ihop med ett annat `OR` i samma objekt - lägg i så fall båda
 * under `AND`.
 */
export function releasedWhere(now: Date = new Date()) {
  return { OR: [{ openAt: null }, { openAt: { lte: now } }] };
}

/**
 * Den enkät som står näst på tur, eller null när inget är schemalagt framåt.
 *
 * Manuellt släppta enkäter räknas inte: de har ingen tidpunkt att visa upp,
 * och ett kort med "Öppnar 1 jan 2099" vore ett löfte om fel sak.
 */
export function nextRelease<T extends Releasable>(
  surveys: T[],
  now: Date = new Date()
): (T & { openAt: Date }) | null {
  const upcoming = surveys
    .filter((s): s is T & { openAt: Date } => !isReleased(s, now) && !isManualRelease(s))
    .sort((a, b) => a.openAt.getTime() - b.openAt.getTime());
  return upcoming[0] ?? null;
}

/**
 * Startpunkten flyttad ett helt antal veckor framåt: samma veckodag, samma
 * klockslag.
 *
 * Räknar på lokala datumkomponenter i stället för att lägga till sju dygn i
 * millisekunder, så att sommartidsomställningen inte flyttar släppet en timme
 * mitt i terminen. Det gör funktionen tidszonsberoende - den ska köras där
 * väggklockan gäller, alltså i lärarens webbläsare, inte på servern.
 */
export function addWeeks(start: Date, weeks: number): Date {
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + weeks * 7,
    start.getHours(),
    start.getMinutes(),
    0,
    0
  );
}

/** Ett släpp i veckan, vecka efter vecka, från startpunkten. */
export function weeklyReleaseDates(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addWeeks(start, i));
}

/**
 * Numret i en enkättitel, om det finns ett: "Veckotest 06" -> 6.
 *
 * Titlarnas numrering bär ofta läsårets luckor - en kurs kan ha test 01-33
 * men hoppa över var femte nummer för repetitionsveckor och lov. Räknas
 * schemat då som "nästa vecka, nästa vecka" glider det ur läge; räknas det
 * mot numret hamnar varje test på sin tänkta vecka och luckorna blir tomma.
 */
export function titleWeekNumber(title: string): number | null {
  const m = title.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Släppdatum per enkät, räknade mot numret i titeln i stället för mot
 * ordningen i listan. Lägsta numret hamnar på startpunkten.
 *
 * Returnerar null om någon titel saknar nummer eller om två delar nummer -
 * då finns ingen entydig veckoplacering och den enkla veckoräkningen gäller.
 */
export function numberedReleaseDates(
  start: Date,
  titles: string[]
): Date[] | null {
  const numbers = titles.map(titleWeekNumber);
  if (numbers.some((n) => n === null)) return null;
  const ns = numbers as number[];
  if (new Set(ns).size !== ns.length) return null;
  const first = Math.min(...ns);
  return ns.map((n) => addWeeks(start, n - first));
}

/**
 * Sorterar titlar som en människa läser dem: "Veckotest 2" före "Veckotest 10".
 * Används för att bestämma vilken enkät som får vilken vecka i schemat.
 */
export function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, "sv", { numeric: true, sensitivity: "base" });
}

/** "mån 25 aug 08:00" - kort nog att stå i en kolumn eller på ett elevkort. */
export function formatRelease(date: Date): string {
  return date.toLocaleString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
