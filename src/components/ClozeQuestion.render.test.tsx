import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import QuestionRenderer from "./QuestionRenderer";

/**
 * Luckfrågans rendering. Det som måste hålla: meningen delas vid markören så
 * fältet hamnar mitt i texten, ledtråden syns, facit finns ingenstans i
 * markupen, och webbläsarens rättstavning är avstängd - annars mäter frågan
 * telefonens stavning i stället för elevens.
 */
const question = {
  id: 7,
  text: "Her ___ on the whole group was obvious.",
  type: "CLOZE",
  options: [],
  cloze: { hint: "Inflytande / Påverkan" },
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

describe("luckfrågan", () => {
  it("delar meningen vid markören och lägger ett fält där", () => {
    const html = render();
    expect(html).toContain("Her ");
    expect(html).toContain(" on the whole group was obvious.");
    expect(html).toContain('type="text"');
    // Markören ska bytas mot fältet, inte visas för eleven
    expect(html).not.toContain("___");
  });

  it("visar den svenska ledtråden", () => {
    const html = render();
    expect(html).toContain("Inflytande / Påverkan");
  });

  it("stänger av rättstavning och autokorrigering", () => {
    // HTML-attribut är skiftlägesokänsliga; React skriver dem som de deklareras.
    const html = render().toLowerCase();
    expect(html).toContain('spellcheck="false"');
    expect(html).toContain('autocorrect="off"');
    expect(html).toContain('autocapitalize="off"');
    expect(html).toContain('autocomplete="off"');
  });

  it("läcker inte facit till klienten", () => {
    // Frågan har ingen answer-egenskap alls i luckläge - facit ligger kvar i
    // Question.config på servern och når aldrig hit.
    const html = render();
    expect(html).not.toContain("influence");
  });

  it("behåller elevens påbörjade svar", () => {
    const html = render({ answers: { 7: "influense" } });
    expect(html).toContain('value="influense"');
  });

  it("renderas som lucka även när kursen kör flashcardläge", () => {
    // Kortläget gäller bara flervalsfrågor. En luckfråga i samma kurs ska
    // fortfarande ha sitt inmatningsfält, inte en "Visa svar"-knapp.
    const html = render({ flashcard: true });
    expect(html).toContain('type="text"');
    expect(html).not.toContain("Visa svar");
  });
});
