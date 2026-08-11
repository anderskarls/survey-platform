/**
 * Omtag är tillåtna sedan migrationen `allow_response_retakes` - samma elev kan
 * ha flera `Response` på samma enkät. Ett aggregat ska ändå väga varje elev en
 * gång, annars räknas den elev som lämnat in två gånger dubbelt i
 * svarsfördelningen och `answeredBy` kan bli större än klassen.
 *
 * Elevöversikten (`admin/courses/[courseId]/progress`) gjorde redan det här;
 * resultatvyerna och momentrapporten summerade i stället alla svarsrader, så de
 * två lärarvyerna visade olika bild av samma klass utan att flagga det.
 *
 * Senaste inlämningen vinner. Vid exakt samma tidsstämpel (samtidiga
 * inlämningar från dubbelklick landar inom samma millisekund) avgör högsta id.
 */
export function senasteSvarPerElev<
  T extends { id: number; studentId: number; createdAt: Date },
>(responses: T[]): T[] {
  const senaste = new Map<number, T>();

  for (const r of responses) {
    const tidigare = senaste.get(r.studentId);
    if (!tidigare || arSenare(r, tidigare)) {
      senaste.set(r.studentId, r);
    }
  }

  return [...senaste.values()];
}

function arSenare(
  a: { id: number; createdAt: Date },
  b: { id: number; createdAt: Date }
): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff === 0 ? a.id > b.id : diff > 0;
}
