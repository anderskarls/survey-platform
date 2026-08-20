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
