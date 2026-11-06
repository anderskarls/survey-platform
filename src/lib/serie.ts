import { lasTabellsvar, parseTabellConfig } from "@/lib/tabell";
import { parseLessonDate } from "@/lib/moment-status";

/**
 * Serier - momentuppgifter som eleven fyller i som en helhet (kartvyn).
 *
 * Kartan i Medeltiden var sju uppgifter, en per lektion, med samma fem frågor
 * om ett nytt nedslag. Lämnades de in var för sig hamnade de gamla sidorna
 * utspridda under Mina resultat, och eleven kunde inte gå tillbaka och bygga
 * vidare. En serie är samma uppgifter märkta med `Survey.series`: eleven får en
 * vy med en flik per lektion, allt sparas som utkast (DraftResponse) och kan
 * ändras när som helst. Ingen inlämning - en sida räknas som klar när varje
 * ruta är ifylld (`serieKlar`), så momentets mätare fortfarande går mot 100 %.
 *
 * Lärarsidan behöver ingenting nytt: klassrapporten och dashboarden läser
 * redan utkast, och momentfeedbacken (post_assignment_feedback) är per elev.
 * Det som INTE fungerar är save_feedback på enskilda svar - det kräver en
 * inlämning.
 */

export interface SerieFraga {
  id: number;
  type: string;
  config: unknown;
}

/** Utkastets svar (JSON: Record<questionId, value>). Trasigt eller tomt ger {}. */
export function lasUtkast(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const ut: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") ut[k] = v;
    return ut;
  } catch {
    return {};
  }
}

/**
 * Är frågan färdigbesvarad? En tabell kräver att VARJE skrivruta är ifylld -
 * en karta med fyra av fem rader är inte klar. Andra typer: något skrivet.
 * Trasig tabellconfig räknas som besvarad om något alls står där, så att en
 * felaktig uppgift inte låser mätaren för alltid.
 */
export function arBesvarad(fraga: SerieFraga, value: string | undefined): boolean {
  if (!value || value.trim() === "") return false;
  if (fraga.type !== "TABLE") return true;
  const config = parseTabellConfig(fraga.config);
  if (!config) return true;
  const rutor = lasTabellsvar(value);
  return config.rader.every((rad, r) =>
    rad.every((x, k) => x !== null || (rutor[`${r}:${k}`] ?? "").trim() !== "")
  );
}

/** Sidan är klar när varje fråga är färdigbesvarad i utkastet. */
export function serieKlar(fragor: SerieFraga[], utkast: string | null | undefined): boolean {
  if (fragor.length === 0) return false;
  const svar = lasUtkast(utkast);
  return fragor.every((f) => arBesvarad(f, svar[String(f.id)]));
}

/**
 * Sidans namn utan seriens numrering: "Kartan 3. Canossa 1077 - påven mot
 * kungen" blir "Canossa 1077 - påven mot kungen". Titlar utan nummer lämnas.
 */
export function sidnamn(title: string): string {
  const m = title.match(/^[^\d]*\d+\.\s+(.+)$/);
  return (m ? m[1] : title).trim();
}

/** Kort fliketikett: sidnamnet fram till första " - " eller ", ". */
export function flikEtikett(title: string): string {
  return sidnamn(title).split(/ - |, /)[0].trim();
}

export function serieHref(unitId: number, series: string, surveyId?: number): string {
  const bas = `/student/moment/${unitId}/serie/${encodeURIComponent(series)}`;
  return surveyId != null ? `${bas}?flik=${surveyId}` : bas;
}

/**
 * Vilken flik som öppnas när eleven inte valt någon. Med lektionsdatum: den
 * senaste sidan vars lektion redan börjat (dagens lektion). Utan datum - som
 * i Medeltiden, där momentet saknar datum - den första sidan som inte är klar,
 * och är allt klart den sista.
 */
export function forvaldFlik(
  flikar: { surveyId: number; klar: boolean; datum?: string | null }[],
  idag: Date = new Date()
): number | null {
  if (flikar.length === 0) return null;
  const dag = new Date(idag.getFullYear(), idag.getMonth(), idag.getDate()).getTime();
  const daterade = flikar
    .map((f) => ({ f, d: parseLessonDate(f.datum ?? undefined) }))
    .filter((x): x is { f: (typeof flikar)[number]; d: Date } => x.d !== null);
  if (daterade.length > 0) {
    const passerade = daterade.filter((x) => x.d.getTime() <= dag);
    return (passerade.length > 0 ? passerade[passerade.length - 1] : daterade[0]).f.surveyId;
  }
  return (flikar.find((f) => !f.klar) ?? flikar[flikar.length - 1]).surveyId;
}

/**
 * Momentsidornas del: för varje serieuppgift i momentet, om sidan är klar och
 * vart den länkar. Uppgifter utan serie finns inte i kartan och visas som förut.
 */
export function serieuppgifter(
  unitId: number,
  surveys: { id: number; series: string | null; questions: { question: SerieFraga }[] }[],
  drafts: { surveyId: number; answers: string }[]
): Map<number, { complete: boolean; href: string }> {
  const utkast = new Map(drafts.map((d) => [d.surveyId, d.answers]));
  const ut = new Map<number, { complete: boolean; href: string }>();
  for (const s of surveys) {
    if (!s.series) continue;
    ut.set(s.id, {
      complete: serieKlar(
        s.questions.map((sq) => sq.question),
        utkast.get(s.id)
      ),
      href: serieHref(unitId, s.series, s.id),
    });
  }
  return ut;
}
