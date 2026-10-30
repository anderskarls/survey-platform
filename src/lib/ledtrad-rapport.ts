/**
 * Ledtrådarna i lärarens rapporter. Ren modul: routerna hämtar HintRequest-
 * raderna (utan impersonated och provkonton) och lämnar dem hit.
 *
 * Diagnosen finns med här - rapporterna är lärarens. Den når aldrig eleven.
 */

export interface LedtradRad {
  surveyId: number;
  studentId: number;
  questionId: number;
  kind: string;
  rung: number | null;
  hint: string;
  diagnosis: string;
  createdAt: Date;
}

export interface LedtradPost {
  kind: string;
  rung: number | null;
  hint: string;
  diagnosis: string;
  createdAt: string;
}

export interface LedtradSammanfattning {
  /** Ledtrådar (steg), inte förklaringar av frågan. */
  antal: number;
  forklaringar: number;
  hogstaRung: number | null;
  poster: LedtradPost[];
}

/** Samma fråga kan ligga i flera uppgifter - därför ingår uppgiften i nyckeln. */
export const ledtradNyckel = (surveyId: number, studentId: number, questionId: number) =>
  `${surveyId}:${studentId}:${questionId}`;

/** Grupperar per uppgift, elev och fråga, i den ordning eleven fick dem. */
export function sammanfattaLedtradar(rader: LedtradRad[]): Map<string, LedtradSammanfattning> {
  const ut = new Map<string, LedtradSammanfattning>();
  const sorterade = [...rader].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const r of sorterade) {
    const nyckel = ledtradNyckel(r.surveyId, r.studentId, r.questionId);
    let s = ut.get(nyckel);
    if (!s) {
      s = { antal: 0, forklaringar: 0, hogstaRung: null, poster: [] };
      ut.set(nyckel, s);
    }
    if (r.kind === "FORKLARING") {
      s.forklaringar++;
    } else {
      s.antal++;
      if (r.rung != null && (s.hogstaRung == null || r.rung > s.hogstaRung)) s.hogstaRung = r.rung;
    }
    s.poster.push({
      kind: r.kind,
      rung: r.rung,
      hint: r.hint,
      diagnosis: r.diagnosis,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return ut;
}

/** "3 ledtrådar, högst R3 · 1 förklaring" - kort nog för en rad i en svarslista. */
export function ledtradEtikett(s: LedtradSammanfattning): string {
  const delar: string[] = [];
  if (s.antal > 0) {
    delar.push(
      `${s.antal} ledtråd${s.antal === 1 ? "" : "ar"}` + (s.hogstaRung != null ? `, högst R${s.hogstaRung}` : "")
    );
  }
  if (s.forklaringar > 0) {
    delar.push(`${s.forklaringar} förklaring${s.forklaringar === 1 ? "" : "ar"}`);
  }
  return delar.join(" · ");
}

/** Stegets namn i en lista: "R2" eller "Förklaring". */
export const postEtikett = (p: { kind: string; rung: number | null }) =>
  p.kind === "FORKLARING" ? "Förklaring" : `R${p.rung ?? "?"}`;
