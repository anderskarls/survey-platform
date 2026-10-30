import { nastaRung, tolkaUnderlag, type LedtradUnderlag, type TidigareLedtrad } from "@/lib/ledtrad";

/**
 * Vem får en ledtråd, och när. Ren funktion så att varje spärr kan testas
 * utan databas - routen hämtar fälten och frågan här.
 *
 * Två nivåer: kanVisaLedtrad avgör om knappen ska finnas alls (sidan använder
 * den), kanFaLedtrad lägger på det som gäller just det här klicket.
 */

export const LEDTRAD_TYPER = ["FREE_TEXT", "REFLECTION"] as const;

/** Förklaringar av frågan räknas inte som steg, men har ett eget tak. */
export const MAX_FORKLARINGAR = 2;

/** Minsta tid mellan två ledtrådar på samma fråga - eleven ska skriva emellan. */
export const VANTETID_MS = 20_000;

export interface VisaKontext {
  survey: { mode: string; lockMode: boolean; courseId: number; slappt: boolean };
  sessionCourseId: number;
  hintsEnabled: boolean;
  fraga: { type: string; iSurvey: boolean; hintBasis: unknown };
}

export interface KlickKontext extends VisaKontext {
  inlamnad: boolean;
  tidigare: (TidigareLedtrad & { createdAt: Date })[];
  nu: Date;
}

export type Spärrsvar =
  | { ok: true; underlag: LedtradUnderlag }
  | { ok: false; status: 403 | 404 | 409 | 429; kod: string; meddelande: string; sekunderKvar?: number };

type Nej = Extract<Spärrsvar, { ok: false }>;

const nej = (status: Nej["status"], kod: string, meddelande: string): Nej => ({
  ok: false,
  status,
  kod,
  meddelande,
});

export function kanVisaLedtrad(k: VisaKontext): Spärrsvar {
  // Okänd och främmande ger samma svar, så att id:n inte går att pröva fram.
  if (k.survey.courseId !== k.sessionCourseId || !k.fraga.iSurvey) {
    return nej(404, "finns-inte", "Uppgiften finns inte.");
  }
  if (k.survey.mode !== "SURVEY" || k.survey.lockMode) {
    return nej(403, "prov", "Ledtrådar finns inte på prov och quiz.");
  }
  if (!k.survey.slappt) return nej(403, "ej-slappt", "Uppgiften är inte öppen än.");
  if (!k.hintsEnabled) return nej(403, "av", "Ledtrådar är inte påslagna för dig.");
  if (!(LEDTRAD_TYPER as readonly string[]).includes(k.fraga.type)) {
    return nej(403, "fel-typ", "Den här frågan har inga ledtrådar.");
  }
  const underlag = tolkaUnderlag(k.fraga.hintBasis);
  if (!underlag) return nej(403, "inget-underlag", "Den här frågan har inga ledtrådar.");
  return { ok: true, underlag };
}

export function kanFaLedtrad(k: KlickKontext): Spärrsvar {
  const visa = kanVisaLedtrad(k);
  if (!visa.ok) return visa;
  if (k.inlamnad) return nej(409, "inlamnad", "Uppgiften är redan inlämnad.");

  const forklaringar = k.tidigare.filter((t) => t.kind === "FORKLARING").length;
  if (nastaRung(k.tidigare) === null || forklaringar > MAX_FORKLARINGAR) {
    return nej(409, "tak", "Nu har du fått alla ledtrådar. Resten klarar du själv.");
  }

  const senast = Math.max(0, ...k.tidigare.map((t) => t.createdAt.getTime()));
  const kvar = senast + VANTETID_MS - k.nu.getTime();
  if (kvar > 0) {
    return { ...nej(429, "vanta", "Skriv vidare en stund innan du ber om nästa."), sekunderKvar: Math.ceil(kvar / 1000) };
  }
  return visa;
}
