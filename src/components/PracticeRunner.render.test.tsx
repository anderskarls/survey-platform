import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PracticeRunner, { type PracticeQuestion } from "./PracticeRunner";

/**
 * Placeringen av "Fortsätt senare" är hela poängen med knappen: står den i
 * framstegsraden syns den inte, och eleven stänger fliken i stället. Testet
 * håller fast att den ligger bredvid huvudknappen - och att den inte dyker
 * upp i pass som inte går att avbryta, som det dagliga.
 */
const kort: PracticeQuestion = {
  id: 1,
  text: 'Vad betyder "attitude"?',
  type: "MULTIPLE_CHOICE",
  options: [],
  flashcard: true,
};

function render(props: Partial<Parameters<typeof PracticeRunner>[0]> = {}) {
  return renderToStaticMarkup(<PracticeRunner questions={[kort]} {...props} />);
}

describe("Fortsätt senare", () => {
  it("visas inte utan pauseHref", () => {
    const html = render();
    expect(html).toContain("Visa svar");
    expect(html).not.toContain("Fortsätt senare");
  });

  it("visas bredvid Visa svar när passet går att avbryta", () => {
    const html = render({ pauseHref: "/student/practice" });
    expect(html).toContain("Visa svar");
    expect(html).toContain("Fortsätt senare");
    // Samma rad: knappen och länken ska ligga i samma flex-behållare, inte
    // under varandra eller uppe i framstegsraden.
    const rad = html.match(
      /<div class="flex items-stretch gap-3">[\s\S]*?<\/a>/
    );
    expect(rad).not.toBeNull();
    expect(rad![0]).toContain("Visa svar");
    expect(rad![0]).toContain("Fortsätt senare");
    expect(rad![0]).toContain('href="/student/practice"');
  });

  it("egen text går att sätta", () => {
    const html = render({
      pauseHref: "/student/practice",
      pauseLabel: "Ta paus",
    });
    expect(html).toContain("Ta paus");
    expect(html).not.toContain("Fortsätt senare");
  });

  it("baksidan ligger inte i markupen före vändningen", () => {
    const html = render({ pauseHref: "/student/practice" });
    expect(html).toContain('Vad betyder &quot;attitude&quot;?');
    expect(html).not.toContain("Attityd");
  });
});
