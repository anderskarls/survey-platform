import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import QuestionRenderer from "./QuestionRenderer";

/**
 * Renderingen av kortet är den del av flashcardläget som inte täcks av
 * logiktesterna. Det som måste hålla: framsidan visas, alternativen syns
 * inte, och baksidan ligger inte i markupen förrän eleven vänt kortet.
 */
const question = {
  id: 1,
  text: 'Vad betyder "attitude"?',
  type: "MULTIPLE_CHOICE",
  options: [
    "Beteende / Uppförande",
    "Attityd / Inställning",
    "Självförtroende / Tillit",
    "Konflikt / Motsättning",
  ],
  answer: "Attityd / Inställning",
  sorting: null,
  timeline: null,
};

function render(props: Partial<Parameters<typeof QuestionRenderer>[0]> = {}) {
  return renderToStaticMarkup(
    <QuestionRenderer
      questions={[question]}
      answers={{}}
      onAnswer={() => {}}
      {...props}
    />
  );
}

describe("kortet i quizet", () => {
  it("visar framsidan och en Visa svar-knapp", () => {
    const html = render({ flashcard: true });
    expect(html).toContain('Vad betyder &quot;attitude&quot;?');
    expect(html).toContain("Visa svar");
  });

  it("visar varken alternativ eller baksida före vändningen", () => {
    const html = render({ flashcard: true });
    // Baksidan får inte ligga synlig i markupen innan eleven vänt kortet
    expect(html).not.toContain("Attityd / Inställning");
    expect(html).not.toContain("Beteende / Uppförande");
    expect(html).not.toContain("Jag är inte säker");
    expect(html).not.toContain("Om igen");
  });

  it("visar baksidan och skattningen för ett redan skattat kort", () => {
    // Eleven backar till ett kort den svarat på: kortet ligger vänt
    const html = render({ flashcard: true, answers: { 1: "__FC_GOOD__" } });
    expect(html).toContain("Attityd / Inställning");
    expect(html).toContain("Om igen");
    expect(html).toContain("Svårt");
    expect(html).toContain("Bra");
    expect(html).toContain("Lätt");
    expect(html).not.toContain("Visa svar");
  });

  it("faller tillbaka på alternativlista när läget är av", () => {
    const html = render({ flashcard: false });
    expect(html).toContain("Beteende / Uppförande");
    expect(html).toContain("Jag är inte säker");
    expect(html).not.toContain("Visa svar");
  });
});

/**
 * Tidslinjefrågan i enkätflödet.
 *
 * Den var spärrad här: renderaren visade "kan inte besvaras här" och hänvisade
 * till förmågeträningen, eftersom en typ utan egen gren annars faller igenom
 * till en textruta. Testet håller båda halvorna av öppningen - att tidslinjen
 * verkligen ritas, och att facit inte följer med in i markupen.
 */
const tidslinjefraga = {
  id: 5,
  text: "Placera jordbruksrevolutionen på axeln",
  type: "TIMELINE",
  options: [],
  sorting: null,
  timeline: {
    form: "placera" as const,
    fran: -10500,
    till: 1900,
    epoker: [{ namn: "Antiken", fran: -3000, till: 476 }],
    handelser: [
      { ar: 476, etikett: "Västroms siste kejsare avsätts" },
      { ar: 1492, etikett: null },
    ],
    antal: 1,
  },
};

describe("tidslinjefrågan i enkäten", () => {
  it("ritar tidslinjen i stället för att hänvisa till förmågeträningen", () => {
    const html = renderToStaticMarkup(
      <QuestionRenderer
        questions={[tidslinjefraga]}
        answers={{}}
        onAnswer={() => {}}
      />
    );
    expect(html).toContain("<svg");
    expect(html).toContain("ANTIKEN");
    expect(html).toContain("Västroms siste kejsare avsätts");
    expect(html).not.toContain("kan inte besvaras här");
    // Textrutan som typen föll igenom till förut ska inte finnas kvar.
    expect(html).not.toContain("<textarea");
  });

  it("säger till om konfigurationen är trasig i stället för att visa en textruta", () => {
    const html = renderToStaticMarkup(
      <QuestionRenderer
        questions={[{ ...tidslinjefraga, timeline: null }]}
        answers={{}}
        onAnswer={() => {}}
      />
    );
    expect(html).toContain("felaktigt uppsatt");
    expect(html).not.toContain("<textarea");
  });
});
