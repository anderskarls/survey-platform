/**
 * Vilken av en elevs inlämningar som gäller när klassen räknas samman.
 *
 * Omtag är tillåtna sedan migrationen `allow_response_retakes` - samma elev kan
 * ha flera `Response` på samma enkät. Ett aggregat ska ändå väga varje elev en
 * gång, annars räknas den elev som lämnat in två gånger dubbelt i
 * svarsfördelningen och `answeredBy` kan bli större än klassen.
 *
 * Elevöversikten (`admin/courses/[courseId]/progress`) gjorde redan det här;
 * resultatvyerna och momentrapporten summerade i stället alla svarsrader, så de
 * två lärarvyerna visade olika bild av samma klass utan att flagga det.
 *
 * **I prov gäller den mest fullständiga inlämningen, senaste vid lika.**
 * Fram till 2026-09-22 filtrerade elevens testvy bort frågor hen redan klarat,
 * så ett omtag blev en inlämning med bara de fel eleven haft. Med "senaste
 * vinner" ersatte det elevens hela prov i lärarvyn: den som gjort 9 rätt av 10
 * och gått tillbaka för den tionde stod som 1/1, alltså 100 % på ett prov med
 * en fråga. 83 av 96 omtag i prod såg ut så. Testvyn ger numera hela testet
 * varje gång, vilket gör regeln till en ren no-op framåt - alla omtag är lika
 * stora och då avgör tiden - men den läser historiken rätt.
 *
 * I enkätläge gäller senaste inlämningen som förut. Där kastas obesvarade
 * frågor i stället för att sparas som fel, så ett färre antal svar betyder att
 * eleven hoppade över något - inte att inlämningen är ett stympat omtag.
 */

type Inlamning = {
  id: number;
  studentId: number;
  createdAt: Date;
  answers: unknown[];
};

export function gallandeSvarPerElev<T extends Inlamning>(
  responses: T[],
  val: { quiz: boolean }
): T[] {
  const gallande = new Map<number, T>();

  for (const r of responses) {
    const tidigare = gallande.get(r.studentId);
    if (!tidigare || slarUt(r, tidigare, val.quiz)) {
      gallande.set(r.studentId, r);
    }
  }

  return [...gallande.values()];
}

/** Slår inlämningen a ut den som hittills gällde? */
function slarUt(a: Inlamning, b: Inlamning, quiz: boolean): boolean {
  if (quiz && a.answers.length !== b.answers.length) {
    return a.answers.length > b.answers.length;
  }
  return arSenare(a, b);
}

/**
 * Senare i tid. Vid exakt samma tidsstämpel (samtidiga inlämningar från
 * dubbelklick landar inom samma millisekund) avgör högsta id.
 */
function arSenare(
  a: { id: number; createdAt: Date },
  b: { id: number; createdAt: Date }
): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff === 0 ? a.id > b.id : diff > 0;
}
