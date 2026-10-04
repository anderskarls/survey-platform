import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TidslinjespelRunner, { Uppgift, skrivetAr } from "./TidslinjespelRunner";
import { formatAr } from "@/lib/tidslinje";
import { genereraRunda, klientItem, tidslinjespelDataSchema } from "@/lib/tidslinjespel";

/**
 * Det som måste hålla: en uppgift renderad ur det klienten får visar aldrig
 * målets årtal före svar, och skrivuppgiftens f.Kr.-växel vänder årtalet
 * bara när texten inte redan säger vilken sida av Kristus det gäller.
 */
const DATA = tidslinjespelDataSchema.parse({
  epoker: [
    { namn: "Antiken", fran: -3000, till: 476 },
    { namn: "Medeltiden", fran: 476, till: 1492 },
    { namn: "Tidigmodern tid", fran: 1492, till: 1789 },
  ],
  handelser: [
    { ar: -2560, rubrik: "Cheopspyramiden byggs", cirka: true },
    { ar: -776, rubrik: "De första olympiska spelen" },
    { ar: -509, rubrik: "Romerska republiken utropas" },
    { ar: -44, rubrik: "Caesar mördas" },
    { ar: 800, rubrik: "Karl den store kröns" },
    { ar: 1066, rubrik: "Slaget vid Hastings" },
    { ar: 1347, rubrik: "Digerdöden" },
    { ar: 1517, rubrik: "Reformationen" },
    { ar: 1648, rubrik: "Westfaliska freden" },
  ],
});

describe("TidslinjespelRunner", () => {
  it("visar startskärmen med rekordet", () => {
    const html = renderToStaticMarkup(
      <TidslinjespelRunner
        lage={{ typ: "fritt", slug: "hi1b" }}
        titel="Historia 1b"
        basta={720}
        senaste={650}
        antalRundor={3}
      />
    );
    expect(html).toContain("Historia 1b");
    expect(html).toContain("720");
    expect(html).toContain("Starta en omgång");
  });

  it("erbjuder en påbörjad släppt omgång att fortsätta", () => {
    const html = renderToStaticMarkup(
      <TidslinjespelRunner
        lage={{ typ: "omgang", releaseId: 3, besvarade: 4, antalUppgifter: 10 }}
        titel="Antiken"
      />
    );
    expect(html).toContain("ett försök");
    expect(html).toContain("Fortsätt med uppgift 5 av 10");
    expect(html).not.toContain("rekord");
  });

  it("visar inte målets årtal i någon uppgift före svar", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const item of genereraRunda(DATA, seed)) {
        const html = renderToStaticMarkup(
          <Uppgift item={klientItem(item)} rattning={null} laddar={false} onSvar={() => {}} />
        );
        for (const mal of item.config.mal) {
          // Ankarnas årtal står i plattor; målets får inte finnas bland dem.
          expect(html).not.toContain(`>${formatAr(mal.ar, mal.cirka)}<`);
        }
        if (item.form !== "ordna") expect(html).toContain(item.config.mal[0].rubrik);
      }
    }
  });
});

describe("skrivetAr", () => {
  it("vänder årtalet med växeln", () => {
    expect(skrivetAr("509", true)).toBe(-509);
    expect(skrivetAr("509", false)).toBe(509);
  });

  it("låter texten gå före växeln", () => {
    expect(skrivetAr("509 f.Kr.", false)).toBe(-509);
    expect(skrivetAr("-509", true)).toBe(-509);
  });

  it("ger null för något som inte är ett årtal", () => {
    expect(skrivetAr("hej", true)).toBeNull();
  });
});
