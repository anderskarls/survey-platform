import { compareTitles, isReleased } from "@/lib/survey-release";
import { CLOZE_GAP, parseClozeConfig } from "@/lib/cloze";

/**
 * Nya versioner av ett släppt veckotest - samma ord, nya meningar.
 *
 * Önskemålet kom från läraren i engelskakurserna. Veckotestets meningar är
 * desamma som luckmeningskorten i övningen, så en elev som övat har sett exakt
 * meningen förut och kan känna igen den i stället för ordet. En ny version
 * byter sammanhanget och håller ordet: facit, stavningsvarianter och den
 * svenska ledtråden följer med oförändrade.
 *
 * Tre regler bär funktionen:
 *   - Versionen är en egen enkät med egna frågor och egna resultat, bredvid
 *     originalet. Originalet rörs aldrig, och resultaten slås inte ihop.
 *   - Meningarna skrivs i förväg och ligger i luckfrågans `config.variants`.
 *     Version n tar mening n-1 (index n-2), så versioner kan skapas utan att
 *     någon skriver något när läraren trycker på knappen. Tar meningarna slut
 *     för något ord finns ingen fler version - hellre det än en version där
 *     halva testet är originalets meningar.
 *   - Bara ett släppt original kan få versioner. En version av en version
 *     vore en kopia av samma meningsbank med ett förvirrande nummer.
 */

export interface VersionQuestion {
  type: string;
  text: string;
  config: unknown;
  topicId: number;
}

export interface VersionSource {
  title: string;
  openAt: Date | null;
  versionOfId: number | null;
  /** I testets ordning. */
  questions: VersionQuestion[];
}

/** De extra meningarna för en luckfråga; tom lista för allt annat. */
export function variantsOf(q: Pick<VersionQuestion, "type" | "config">): string[] {
  if (q.type !== "CLOZE") return [];
  return parseClozeConfig(q.config)?.variants ?? [];
}

/**
 * Nästa versionsnummer. Räknas på det högsta som finns, inte på antalet, så
 * att en borttagen version inte gör att nästa krockar med en som står kvar.
 * Meningen den versionen hade används inte igen.
 */
export function nextVersionNumber(existing: number[]): number {
  return Math.max(1, ...existing) + 1;
}

/** Hur många versioner till testet räcker till. 0 = inga fler. */
export function versionsLeft(
  questions: Pick<VersionQuestion, "type" | "config">[],
  existing: number[]
): number {
  if (questions.length === 0) return 0;
  const fewest = Math.min(...questions.map((q) => variantsOf(q).length));
  // Version n tar variants[n-2]; versioner upp till fewest + 1 går att göra.
  return Math.max(0, fewest + 1 - (nextVersionNumber(existing) - 1));
}

export type VersionPlan =
  | {
      ok: true;
      title: string;
      versionNumber: number;
      questions: {
        type: "CLOZE";
        text: string;
        config: { answer: string; accept: string[]; hint?: string };
        topicId: number;
      }[];
    }
  | { ok: false; status: number; error: string };

/**
 * Vad som ska skapas för nästa version - eller varför det inte går. Ren
 * funktion; routen gör skrivningen.
 */
export function planVersion(
  source: VersionSource,
  existing: number[],
  now: Date = new Date()
): VersionPlan {
  if (source.versionOfId !== null) {
    return {
      ok: false,
      status: 400,
      error: "Det här är redan en version. Skapa nya versioner från originalet.",
    };
  }
  if (!isReleased(source, now)) {
    return {
      ok: false,
      status: 400,
      error: "Testet är inte öppnat än. Öppna originalet först.",
    };
  }
  if (source.questions.length === 0) {
    return { ok: false, status: 400, error: "Testet har inga frågor." };
  }

  const versionNumber = nextVersionNumber(existing);
  const index = versionNumber - 2;
  const saknas: string[] = [];
  const questions: Extract<VersionPlan, { ok: true }>["questions"] = [];

  for (const q of source.questions) {
    const config = q.type === "CLOZE" ? parseClozeConfig(q.config) : null;
    const text = config?.variants?.[index];
    if (!config || !text || !text.includes(CLOZE_GAP)) {
      saknas.push(config?.answer ?? q.text.slice(0, 40));
      continue;
    }
    questions.push({
      type: "CLOZE",
      text,
      // Variantlistan följer inte med: en version ska inte kunna bli källa.
      config: {
        answer: config.answer,
        accept: config.accept,
        ...(config.hint !== undefined ? { hint: config.hint } : {}),
      },
      topicId: q.topicId,
    });
  }

  if (saknas.length > 0) {
    return {
      ok: false,
      status: 409,
      error:
        `Det finns ingen mening till version ${versionNumber} för ` +
        `${saknas.length === 1 ? "ordet" : "orden"} ${saknas.join(", ")}.`,
    };
  }

  return {
    ok: true,
    title: `${source.title} - version ${versionNumber}`,
    versionNumber,
    questions,
  };
}

export interface VersionableSurvey {
  id: number;
  title: string;
  openAt: Date | null;
  versionOfId: number | null;
  versionNumber: number | null;
  questions: Pick<VersionQuestion, "type" | "config">[];
}

export interface VersionCandidate {
  id: number;
  title: string;
  nextVersion: number;
  left: number;
}

/**
 * De släppta originalen i en kurs som kan få en version till, i titelordning.
 * Versionsnumren hämtas ur kursens egna versioner så att sidan klarar sig med
 * en enda fråga mot databasen.
 */
export function versionCandidates(
  surveys: VersionableSurvey[],
  now: Date = new Date()
): VersionCandidate[] {
  const numbers = new Map<number, number[]>();
  for (const s of surveys) {
    if (s.versionOfId !== null && s.versionNumber !== null) {
      numbers.set(s.versionOfId, [...(numbers.get(s.versionOfId) ?? []), s.versionNumber]);
    }
  }
  return surveys
    .filter((s) => s.versionOfId === null && isReleased(s, now))
    .map((s) => {
      const existing = numbers.get(s.id) ?? [];
      return {
        id: s.id,
        title: s.title,
        nextVersion: nextVersionNumber(existing),
        left: versionsLeft(s.questions, existing),
      };
    })
    .filter((c) => c.left > 0)
    .sort((a, b) => compareTitles(a.title, b.title));
}
