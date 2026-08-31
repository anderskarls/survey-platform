import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import QuestionRenderer from "./QuestionRenderer";

/**
 * Luckmeningskortets rendering. Det som måste hålla: framsidan visar meningen
 * med en tom lucka och aldrig ordet, kortet är ett kort även i kurser utan
 * flashcardläge (typen avgör, inte kursen), och baksidan visar samma mening
 * med ordet på plats - inte ordet ensamt.
 */
const card = {
  id: 11,
  text: "Her ___ on the whole group was obvious.",
  type: "CLOZE_CARD",
  options: [],
  answer: "influence",
  cloze: { hint: "Inflytande / Påverkan" },
};

function render(props: Partial<Parameters<typeof QuestionRenderer>[0]> = {}) {
  return renderToStaticMarkup(
    <QuestionRenderer
      questions={[card]}
      answers={{}}
      onAnswer={() => {}}
      {...props}
    />
  );
}

describe("luckmeningskortet", () => {
  it("visar meningen med luckan tom på framsidan", () => {
    const html = render();
    expect(html).toContain("Her ");
    expect(html).toContain(" on the whole group was obvious.");
    // Markören byts mot en tom rad - varken understreck eller facit
    expect(html).not.toContain("___");
    expect(html).not.toContain("influence");
  });

  it("är ett kort även utan flashcardläge på kursen", () => {
    const html = render({ flashcard: false });
    expect(html).toContain("Visa svar");
    // Ingen alternativlista och inget inmatningsfält
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('type="text"');
  });

  it("visar baksidan för ett redan skattat kort - hela meningen, ordet ifyllt", () => {
    // Ett skattat kort renderas vänt, så eleven ser sitt svar när den backar
    const html = render({ answers: { 11: "__FC_GOOD__" } });
    expect(html).toContain("influence");
    expect(html).toContain("Her ");
    expect(html).toContain(" on the whole group was obvious.");
    expect(html).not.toContain("Visa svar");
  });

  it("ger luckan ett ord åt skärmläsaren i stället för tre understreck", () => {
    const html = render();
    expect(html).toContain("lucka");
  });

  it("visar ledtråden på framsidan men inte på baksidan", () => {
    expect(render()).toContain("Inflytande / Påverkan");
    expect(render({ answers: { 11: "__FC_GOOD__" } })).not.toContain(
      "Inflytande / Påverkan"
    );
  });
});
